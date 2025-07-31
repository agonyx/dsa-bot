const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
require('dotenv').config();
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
        const BACKEND_URL = process.env.BACKEND_URL;

        try {
            const playerResponse = await axios.get(`${BACKEND_URL}/player/selected/${user.id}`);
            const player = playerResponse.data;
            if (!player) return await interaction.respond([]);

            const skillsResponse = await axios.get(`${BACKEND_URL}/player/${player.id}/action-modifications?actionType=MELEE`);
            const skills = skillsResponse.data;

            const choices = skills.map(skill => ({ name: skill.name, value: skill.id }));
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

        const activeCombatantId = sessionData.turnOrder[sessionData.currentTurnIndex];
        if (attackerCombatant.id !== activeCombatantId) {
            return interaction.editReply("❌ It's not your turn!");
        }

        const targetCombatant = sessionData.combatants.find(c => c.discordUserId === targetUser.id);
        if (!targetCombatant) {
            return interaction.editReply('❌ The specified target is not in this combat.');
        }

        await resolveCombatAction(client, channelId, sessionData.id, attackerCombatant.id, targetCombatant.id, maneuverId);
        
        await interaction.editReply(`Your skill use against ${targetUser.username} has been resolved.`);
    },
};
