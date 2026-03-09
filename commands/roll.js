const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { rollDice } = require('../utils/rollUtil');

function parseDiceNotation(notation) {
    const match = notation.match(/^(\d+)?w(\d+)([+-]\d+)?$/i);
    if (!match) return null;

    return {
        count: parseInt(match[1]) || 1,
        sides: parseInt(match[2]),
        modifier: match[3] ? parseInt(match[3]) : 0,
    };
}

function rollNotation(notation) {
    const parsed = parseDiceNotation(notation);
    if (!parsed) return null;

    const rolls = [];
    let total = 0;

    for (let i = 0; i < parsed.count; i++) {
        const roll = rollDice(parsed.sides);
        rolls.push(roll);
        total += roll;
    }

    total += parsed.modifier;

    return { rolls, modifier: parsed.modifier, total };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('roll')
        .setDescription('Roll dice using DSA notation (e.g., 1w20, 3w6+2)')
        .addStringOption(option =>
            option.setName('dice').setDescription('Dice notation (e.g., 1w20, 2w6+3, w6)').setRequired(true)
        )
        .addBooleanOption(option => option.setName('visible').setDescription('Make the roll visible to everyone')),

    async execute(interaction) {
        const notation = interaction.options.getString('dice').toLowerCase().replace('d', 'w');
        const visible = interaction.options.getBoolean('visible') || false;

        const result = rollNotation(notation);

        if (!result) {
            return interaction.reply({
                content: '❌ Invalid dice notation! Use format like `1w20`, `3w6+2`, or `w6`.',
                ephemeral: true,
            });
        }

        const rollsDisplay = result.rolls.join(' + ');
        let modifierDisplay = '';

        if (result.modifier > 0) {
            modifierDisplay = ` + ${result.modifier}`;
        } else if (result.modifier < 0) {
            modifierDisplay = ` - ${Math.abs(result.modifier)}`;
        }

        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(`🎲 Dice Roll: ${notation.toUpperCase()}`)
            .setDescription(`**Result:** \`${result.total}\``)
            .addFields({
                name: 'Rolls',
                value: `\`${rollsDisplay}\`${modifierDisplay}`,
                inline: true,
            })
            .setFooter({
                text: `Rolled by ${interaction.user.username}`,
                iconURL: interaction.user.avatarURL(),
            })
            .setTimestamp();

        return interaction.reply({
            embeds: [embed],
            ephemeral: !visible,
        });
    },
};
