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

client.on(Events.InteractionCreate, async interaction => {
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
        else if (customId === 'stat_select' || customId === 'exit_editor' || customId.startsWith('edit_'))
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
client.once(Events.ClientReady, readyClient => {
    console.log(`✅ Ready! Logged in as ${readyClient.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);
