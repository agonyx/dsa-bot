const { SlashCommandBuilder } = require('discord.js');
const { supabase } = require('../utils/supabaseClient');
const { resolveCombatAction } = require('../handlers/combatHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('use-skill')
        .setDescription('Uses a special combat skill against a target.')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('The target for your skill')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('maneuver')
                .setDescription('The combat maneuver to use')
                .setAutocomplete(true)
                .setRequired(true)),

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        const { client, user } = interaction;

        try {
            const { data: player } = await supabase
                .from('players')
                .select('id')
                .eq('discord_id', user.id)
                .eq('selected', 'YES')
                .single();

            if (!player) return await interaction.respond([]);

            const { data: skills } = await supabase
                .from('player_action_modifications')
                .select(`
                    action_modification:action_modifications(id, name, action_type)
                `)
                .eq('player_id', player.id);

            const meleeSkills = (skills || [])
                .map(s => s.action_modification)
                .filter(s => s && s.action_type === 'MELEE');

            const choices = meleeSkills.map(skill => ({ name: skill.name, value: skill.id }));
            const filtered = choices.filter(choice => choice.name.toLowerCase().startsWith(focusedValue.toLowerCase()));
            
            await interaction.respond(filtered);
        } catch (error) {
            console.error('Error during maneuver autocomplete:', error);
            await interaction.respond([]);
        }
    },

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const { client, channelId, user } = interaction;
        const targetUser = interaction.options.getUser('target');
        const maneuverId = interaction.options.getString('maneuver');

        const sessionData = client.activeCombats.get(channelId);
        if (!sessionData || sessionData.state !== 'RUNNING') {
            return interaction.editReply('❌ There is no active combat in this channel.');
        }

        const attackerCombatant = sessionData.combatants.find(c => c.discordUserId === user.id);
        if (!attackerCombatant) {
            return interaction.editReply('❌ You are not in this combat.');
        }

        const activeCombatantId = sessionData.turn_order[sessionData.current_turn_index];
        if (attackerCombatant.id !== activeCombatantId) {
            return interaction.editReply("❌ It's not your turn!");
        }

        const targetCombatant = sessionData.combatants.find(c => c.discordUserId === targetUser.id);
        if (!targetCombatant) {
            return interaction.editReply('❌ The specified target is not in this combat.');
        }

        // Validate skill ownership
        const { data: playerSkill, error: skillError } = await supabase
            .from('player_action_modifications')
            .select('id')
            .eq('player_id', attackerCombatant.player_id)
            .eq('action_modification_id', maneuverId)
            .single();

        if (skillError || !playerSkill) {
            return interaction.editReply('❌ You do not have access to this skill or it does not exist.');
        }

        await resolveCombatAction(client, channelId, sessionData.id, attackerCombatant.id, targetCombatant.id, maneuverId);
        
        await interaction.editReply(`Your skill use against ${targetUser.username} has been resolved.`);
    },
};
