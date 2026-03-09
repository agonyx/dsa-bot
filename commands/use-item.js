const { SlashCommandBuilder, StringSelectMenuBuilder, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const { supabase } = require('../utils/supabaseClient');
const { rollDice } = require('../utils/rollUtil');
const { createLogger } = require('../utils/logger');
const log = createLogger('use-item');

const CONSUMABLE_TYPES = ['POTION', 'FOOD', 'SCROLL'];

module.exports = {
    data: new SlashCommandBuilder().setName('use-item').setDescription('Use a consumable item from your inventory'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const { data: player, error } = await supabase
                .from('players')
                .select(
                    `
                    id,
                    name,
                    avatar,
                    stats:stats(id, le_max, le_current),
                    items:items(*)
                `
                )
                .eq('discord_id', interaction.user.id)
                .eq('selected', 'YES')
                .single();

            if (error || !player) {
                return interaction.editReply({
                    content: 'No selected character! Use /choose-character first',
                });
            }

            const stats = Array.isArray(player.stats) ? player.stats[0] : player.stats;

            if (!player.items || player.items.length === 0) {
                return interaction.editReply({
                    content: 'Your character has no items to use.',
                });
            }

            // Filter to consumable items
            const consumableItems = player.items.filter(
                item => CONSUMABLE_TYPES.includes(item.type) || item.effect // Any item with an effect is usable
            );

            if (consumableItems.length === 0) {
                return interaction.editReply({
                    content: 'No usable items found. (Items with type POTION, FOOD, SCROLL, or with an effect)',
                });
            }

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('use_item_select')
                .setPlaceholder('Select an item to use')
                .addOptions(
                    consumableItems.map(item => ({
                        label: `${item.name} (x${item.quantity || 1})`,
                        description:
                            item.effect?.substring(0, 100) || item.description?.substring(0, 100) || 'No effect',
                        value: item.id.toString(),
                    }))
                );

            const row = new ActionRowBuilder().addComponents(selectMenu);

            const message = await interaction.editReply({
                content: `Select an item for **${player.name}** to use:`,
                components: [row],
            });

            const collector = message.createMessageComponentCollector({
                filter: i => i.user.id === interaction.user.id,
                time: 60000,
            });

            collector.on('collect', async i => {
                if (i.customId === 'use_item_select') {
                    const itemId = i.values[0];
                    const item = consumableItems.find(item => item.id.toString() === itemId);

                    let effectResult;
                    let healingDone = 0;

                    // Parse effect for dice notation (e.g., "Heal 1w6+2", "Restore 2w8 HP")
                    const effectText = item.effect || item.description || '';

                    // Look for healing patterns
                    const healMatch = effectText.match(/(\d+)?w(\d+)(\s*[+-]\s*\d+)?/i);

                    if (healMatch) {
                        const count = parseInt(healMatch[1]) || 1;
                        const sides = parseInt(healMatch[2]);
                        const modifier = healMatch[3] ? parseInt(healMatch[3].replace(/\s/g, '')) : 0;

                        let rollTotal = 0;
                        const rolls = [];
                        for (let r = 0; r < count; r++) {
                            const roll = rollDice(sides);
                            rolls.push(roll);
                            rollTotal += roll;
                        }
                        healingDone = rollTotal + modifier;

                        const newHP = Math.min(stats.le_current + healingDone, stats.le_max);
                        healingDone = newHP - stats.le_current;

                        if (healingDone > 0) {
                            await supabase.from('stats').update({ le_current: newHP }).eq('id', stats.id);

                            stats.le_current = newHP;
                        }

                        const rollStr = `${rolls.join(' + ')}${modifier !== 0 ? (modifier > 0 ? ' + ' : ' - ') + Math.abs(modifier) : ''}`;
                        effectResult =
                            effectText.includes('Heal') ||
                            effectText.includes('heal') ||
                            effectText.includes('Restore') ||
                            effectText.includes('restore')
                                ? `**Healed for ${healingDone} HP!** (${rollStr} = ${rollTotal + modifier})`
                                : `**Effect:** ${effectText}\nRolled: ${rollStr} = ${rollTotal + modifier}`;
                    } else if (effectText) {
                        effectResult = `**Effect:** ${effectText}`;
                    } else {
                        effectResult = `Used **${item.name}**.`;
                    }

                    // Consume item
                    if (item.quantity && item.quantity > 1) {
                        await supabase
                            .from('items')
                            .update({ quantity: item.quantity - 1 })
                            .eq('id', itemId);
                    } else {
                        await supabase.from('items').delete().eq('id', itemId);
                    }

                    const embed = new EmbedBuilder()
                        .setColor(0x57f287)
                        .setTitle('🧪 Item Used')
                        .setDescription(`**${player.name}** used **${item.name}**`)
                        .addFields({ name: 'Effect', value: effectResult });

                    if (healingDone > 0) {
                        const healthBar =
                            '■'.repeat(Math.round((stats.le_current / stats.le_max) * 10)) +
                            '□'.repeat(10 - Math.round((stats.le_current / stats.le_max) * 10));
                        embed.addFields({
                            name: 'Current HP',
                            value: `${healthBar} ${stats.le_current}/${stats.le_max}`,
                        });
                    }

                    const remainingQty = (item.quantity || 1) - 1;
                    embed.setFooter({
                        text: remainingQty > 0 ? `Remaining: ${remainingQty}` : 'Item consumed',
                    });

                    await i.update({
                        content: '',
                        embeds: [embed],
                        components: [],
                    });
                    collector.stop();
                }
            });

            collector.on('end', (collected, reason) => {
                if (reason === 'time') {
                    interaction
                        .editReply({
                            content: '⏰ Item selection timed out.',
                            components: [],
                        })
                        .catch(() => {});
                }
            });
        } catch (error) {
            log.error({ error }, 'Use item error');
            interaction.editReply({
                content: `❌ Failed to use item: ${error.message}`,
            });
        }
    },
};
