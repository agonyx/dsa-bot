// Load environment variables and Discord client
require('dotenv').config();
const { Client, Events, GatewayIntentBits, Collection, Partials } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: [
        Partials.Channel,
        Partials.GuildMember,
        Partials.User,
        Partials.Message,
    ]
});

// Command handling
client.commands = new Collection(); 
client.activeCombats = new Map();
client.pendingCombatActions = new Map();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}

// Event handling
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
    } else {
        client.on(event.name, (...args) => event.execute(...args));
    }
}

const combatHandler = require('./handlers/combatHandler'); // Assuming CommonJS
const { supabase } = require('./utils/supabaseClient');

/**
 * Recovers active or paused combat sessions from the database on bot startup.
 * @param {Client} client The Discord client instance.
 */
async function recoverActiveCombats(client) {
    console.log('[Recovery] Starting active combat session recovery...');
    try {
        // Fetch sessions that are RUNNING or PAUSED with their combatants
        const { data: sessions, error } = await supabase
            .from('combat_sessions')
            .select('*, combatants(*)')
            .in('state', ['RUNNING', 'PAUSED']);

        if (error) {
            console.error('[Recovery] Database error:', error);
            return;
        }

        if (!sessions || sessions.length === 0) {
            console.log('[Recovery] No active or paused sessions found to recover.');
            return;
        }

        console.log(`[Recovery] Found ${sessions.length} session(s) to recover.`);

        for (const session of sessions) {
            if (!session.channel_id || !session.id) {
                console.warn('[Recovery] Skipping session with missing channel_id or id:', session);
                continue;
            }

            // Convert snake_case to camelCase for in-memory compatibility
            const memorySession = {
                ...session,
                dmUserId: session.dm_user_id,
                channelId: session.channel_id,
                messageId: session.message_id,
                combatLog: session.combat_log,
                turnOrder: session.turn_order,
                currentTurnIndex: session.current_turn_index,
                combatants: session.combatants?.map(c => ({
                    ...c,
                    maxHP: c.max_hp,
                    currentHP: c.current_hp,
                    initiativeRoll: c.initiative_roll,
                    initiativeBase: c.initiative_base,
                    playerId: c.player_id,
                    discordUserId: c.discord_user_id,
                    mobDefinitionId: c.mob_definition_id,
                    sessionId: c.session_id,
                    isActiveTurn: c.is_active_turn
                })) || []
            };

            // Add the session back to the in-memory map
            client.activeCombats.set(session.channel_id, memorySession);
            console.log(`[Recovery] Loaded session ${session.id} for channel ${session.channel_id} into memory.`);

            // Refresh the combat display to make buttons interactive again
            try {
                await combatHandler.updateCombatDisplay(client, session.channel_id, memorySession);
                console.log(`[Recovery] Successfully refreshed display for session ${session.id}.`);
            } catch (displayError) {
                console.error(`[Recovery] Failed to update display for session ${session.id} in channel ${session.channel_id}:`, displayError);
                // If the message or channel was deleted, we should remove it from memory
                client.activeCombats.delete(session.channel_id);
            }
        }
        console.log('[Recovery] Finished combat session recovery.');

    } catch (error) {
        console.error('[Recovery] Could not fetch or process active combat sessions:', error.message);
    }
}


client.on(Events.InteractionCreate, async interaction => {
    // --- Handle Autocomplete ---
    if (interaction.isAutocomplete()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command || !command.autocomplete) {
            console.error(`No autocomplete handler for ${interaction.commandName}`);
            return interaction.respond([]).catch(() => {});
        }
        try {
            await command.autocomplete(interaction);
        } catch (error) {
            console.error(`Error in autocomplete for ${interaction.commandName}:`, error);
            await interaction.respond([]).catch(() => {});
        }
        return;
    }
    
    // --- Handle Slash Commands ---
    if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            try {
               await interaction.reply({ content: `Command not found: ${interaction.commandName}`, ephemeral: true });
            } catch (e) { console.error("Error replying about missing command:", e); }
            return;
        }
        try {
            await command.execute(interaction);
        } catch (error) {
           console.error(`Error executing command ${interaction.commandName}:`, error);
            const replyOptions = { content: 'There was an error while executing this command!', ephemeral: true };
            try {
                 if (interaction.replied || interaction.deferred) { await interaction.followUp(replyOptions); }
                 else { await interaction.reply(replyOptions); }
            } catch (replyError) { console.error(`Failed to send error reply for command ${interaction.commandName}:`, replyError); }
        }
    }
    // --- Handle Components (Buttons, Selects, Modals) ---
    else if (interaction.isMessageComponent() || interaction.isModalSubmit()) { // Combined check for components/modals
        const customId = interaction.customId;

        // --- Check for Combat Prefixes ---
        if (customId.startsWith('combat_') || customId.startsWith('join_combat_') ||
            customId.startsWith('add_mob_') || // Catches modal trigger and submit
            customId.startsWith('start_fight_') ||
            customId.startsWith('cancel_combat_') ||
            customId.startsWith('caa_') ||
            customId.startsWith('cad_') ||
            customId.startsWith('cas_') ||
            customId.startsWith('cet_') ||
            customId.startsWith('csm_') || // Combat Skill Maneuver
            customId.startsWith('dmnpc_action') ||
            customId.startsWith('ctsa_') ||
            customId.startsWith('cts_npc_') ||
            customId.startsWith('leave_setup_') ||
            customId.startsWith('manage_participants_') ||
            customId.startsWith('remove_participant_select_') ||
            customId.startsWith('select_char_join_') ||
            customId.startsWith('park_combat_') ||
            customId.startsWith('end_combat_') ||
            customId.startsWith('resume_session_select') ||
            customId.startsWith('show_full_log_'))
        {
            // Route to appropriate combat handler function
            console.log(`Routing combat interaction ${customId} to combatHandler`);
            try {
                if (interaction.isButton()) await combatHandler.handleCombatButton(interaction);
                else if (interaction.isStringSelectMenu()) await combatHandler.handleCombatSelectMenu(interaction);
                else if (interaction.isModalSubmit()) await combatHandler.handleCombatModalSubmit(interaction);
            } catch (error) {
                 console.error(`Error during combat interaction processing (${customId}):`, error);
                 // Attempt to inform user if possible
                  if (!interaction.replied && !interaction.deferred && interaction.isRepliable()) {
                      try { await interaction.reply({ content: 'An error occurred processing this combat action.', ephemeral: true }); }
                      catch(e) { console.error("Failed to send combat interaction error reply", e); }
                  }
            }
        }
        // --- Check for EditStats Prefixes/IDs (and DO NOTHING centrally) ---
        else if (customId === 'stat_select' || 
                 customId === 'exit_editor' || 
                 customId === 'select-character' ||
                 customId === 'skill_select_menu' ||
                 customId === 'confirm_skill_selection' ||
                 customId.startsWith('edit_'))
        {
            // *** Explicitly ignore these IDs in the central handler ***
            console.log(`Ignoring interaction ${customId} in central handler (handled by specific command).`);
            // IMPORTANT: No reply, deferUpdate, or other acknowledgement here!
            // Let the collector/listener in editStats.js handle it.
        }
        // --- Handle Other/Unknown Components ---
        else {
            console.warn(`Unhandled component interaction ID in central handler: ${customId}`);
            // Do not acknowledge unless you have a specific reason for centrally handling unknown components.
        }
    }
    // Add other top-level interaction type handlers if needed (e.g., Context Menus)
});

// Event listener for when the client is ready
client.once(Events.ClientReady, async readyClient => {
    console.log(`✅ Ready! Logged in as ${readyClient.user.tag}`);
    await recoverActiveCombats(readyClient);
});

client.login(process.env.DISCORD_TOKEN);
