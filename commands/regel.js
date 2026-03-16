const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { searchRules, getRuleByTitle } = require('../utils/rulesClient');
const { createLogger } = require('../utils/logger');

const log = createLogger('regel');

const CATEGORY_LABELS = {
    rules: 'Regeln',
    bestiarium: 'Bestiarium',
    magic: 'Magie & Zauber',
    götterwirken: 'Götterwirken & Liturgien',
    special_abilities_profane: 'Kampfsonderfertigkeiten',
    special_abilities_magical: 'Magische Sonderfertigkeiten',
    special_abilities_karmale: 'Karmale Sonderfertigkeiten',
    special_abilities_animal: 'Tier-Sonderfertigkeiten',
    ruestkammer_weapons: 'Waffen',
    ruestkammer_armor: 'Rüstungen',
    ruestkammer_equipment: 'Ausrüstung',
    ruestkammer_artifacts: 'Artefakte',
    ruestkammer_helmets: 'Helme',
    herbarium: 'Herbarium',
    poisons_and_illnesses: 'Gifte & Krankheiten',
    professions: 'Professionen',
    advantages: 'Vorteile',
    disadvantages: 'Nachteile',
    cultures: 'Kulturen',
    species: 'Spezies',
};

const MAX_FIELD_LENGTH = 400;

function formatCategoryLabel(category) {
    return CATEGORY_LABELS[category] || category;
}

function truncate(text, maxLength) {
    if (!text || text.length <= maxLength) return text || '';
    const truncated = text.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    return (lastSpace > maxLength * 0.6 ? truncated.substring(0, lastSpace) : truncated) + '…';
}

function extractDescription(chunkText) {
    if (!chunkText) return '';

    const descMatch = chunkText.match(/Description:\n([\s\S]+?)(?=\n\n[A-Z]|\n\n$|$)/);
    if (descMatch) return descMatch[1].trim();

    const propMatch = chunkText.match(/Properties:\n([\s\S]+?)(?=\n\nDescription|\n\n[A-Z]|\n\n$|$)/);
    if (propMatch) return propMatch[1].trim();

    const lines = chunkText.split('\n').filter(line => {
        return (
            line.trim() &&
            !line.startsWith('Title:') &&
            !line.startsWith('Category:') &&
            !line.startsWith('Breadcrumbs:') &&
            !line.startsWith('Subcategory:')
        );
    });

    return lines.join('\n').trim();
}

function buildResultField(result, index) {
    const similarity = Math.round((result.similarity || 0) * 100);
    const category = formatCategoryLabel(result.resolved_category || result.category);
    const sourceUrl = result.source_url;
    const content = result.chunk_text || result.content || '';

    const description = extractDescription(content);
    const displayText = truncate(description, MAX_FIELD_LENGTH);

    const titleLine = sourceUrl ? `[${result.title}](${sourceUrl})` : result.title;

    const header = `${titleLine}\n*${category}* · ${similarity}% Relevanz`;

    return {
        name: `${index + 1}.`,
        value: `${header}\n\n${displayText || '*Kein Inhalt verfügbar.*'}`,
        inline: false,
    };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('regel')
        .setDescription('Durchsuche das DSA 5 Regelwiki nach Regeln, Zaubern, Kreaturen und mehr.')
        .addStringOption(option =>
            option
                .setName('suche')
                .setDescription('Suchbegriff (z.B. "Finte", "Drache Kampfwerte", "Wundschwelle")')
                .setRequired(true)
                .setMaxLength(200)
        )
        .addStringOption(option =>
            option
                .setName('kategorie')
                .setDescription('Ergebnisse auf eine Kategorie einschränken')
                .setRequired(false)
                .addChoices(
                    { name: 'Regeln', value: 'rules' },
                    { name: 'Bestiarium', value: 'bestiarium' },
                    { name: 'Magie & Zauber', value: 'magic' },
                    { name: 'Götterwirken & Liturgien', value: 'götterwirken' },
                    { name: 'Kampf-SF', value: 'special_abilities_profane' },
                    { name: 'Magische SF', value: 'special_abilities_magical' },
                    { name: 'Karmale SF', value: 'special_abilities_karmale' },
                    { name: 'Waffen', value: 'ruestkammer_weapons' },
                    { name: 'Rüstungen', value: 'ruestkammer_armor' },
                    { name: 'Ausrüstung', value: 'ruestkammer_equipment' },
                    { name: 'Artefakte', value: 'ruestkammer_artifacts' },
                    { name: 'Herbarium', value: 'herbarium' },
                    { name: 'Gifte & Krankheiten', value: 'poisons_and_illnesses' },
                    { name: 'Professionen', value: 'professions' },
                    { name: 'Vorteile', value: 'advantages' },
                    { name: 'Nachteile', value: 'disadvantages' },
                    { name: 'Kulturen', value: 'cultures' },
                    { name: 'Spezies', value: 'species' }
                )
        )
        .addIntegerOption(option =>
            option
                .setName('anzahl')
                .setDescription('Anzahl der Ergebnisse (1-5)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(5)
        )
        .addBooleanOption(option => option.setName('visible').setDescription('Ergebnis für alle sichtbar machen')),

    async execute(interaction) {
        const query = interaction.options.getString('suche');
        const category = interaction.options.getString('kategorie') || null;
        const limit = interaction.options.getInteger('anzahl') || 3;
        const visible = interaction.options.getBoolean('visible') || false;

        await interaction.deferReply({ ephemeral: !visible });

        try {
            const results = await searchRules(query, {
                category,
                limit,
                threshold: 0.4,
            });

            if (!results.length) {
                const noResultEmbed = new EmbedBuilder()
                    .setColor(0x95a5a6)
                    .setTitle('📖 Regelsuche')
                    .setDescription(
                        `Keine Ergebnisse für **„${query}"**${category ? ` in *${formatCategoryLabel(category)}*` : ''}.\n\nVersuche andere Suchbegriffe oder entferne den Kategoriefilter.`
                    )
                    .setFooter({ text: 'DSA 5 Regelwiki · Semantische Suche' });

                return interaction.editReply({ embeds: [noResultEmbed] });
            }

            const fields = results.map((result, index) => buildResultField(result, index));

            const resultEmbed = new EmbedBuilder()
                .setColor(0x8b4513)
                .setTitle('📖 Regelsuche')
                .setDescription(
                    `**${results.length}** Ergebnis${results.length !== 1 ? 'se' : ''} für **„${query}"**${category ? ` in *${formatCategoryLabel(category)}*` : ''}`
                )
                .addFields(fields)
                .setFooter({
                    text: `DSA 5 Regelwiki · ${interaction.user.username}`,
                    iconURL: interaction.user.avatarURL(),
                })
                .setTimestamp();

            return interaction.editReply({ embeds: [resultEmbed] });
        } catch (error) {
            log.error({ error, query, category }, 'Regel search failed');

            if (error.message?.includes('OPENAI_API_KEY')) {
                return interaction.editReply({
                    content: '❌ Regelsuche nicht verfügbar — API-Schlüssel fehlt.',
                });
            }

            return interaction.editReply({
                content: '❌ Fehler bei der Regelsuche. Bitte versuche es erneut.',
            });
        }
    },
};
