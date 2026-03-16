const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { hybridSearch, getRankedTitleMatches } = require('../utils/rulesClient');
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

function formatCategoryLabel(category) {
    return CATEGORY_LABELS[category] || category;
}

function truncate(text, maxLength) {
    if (!text || text.length <= maxLength) return text || '';
    const truncated = text.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    return (lastSpace > maxLength * 0.6 ? truncated.substring(0, lastSpace) : truncated) + '…';
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
                .setAutocomplete(true)
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

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        const category = interaction.options.getString('kategorie');
        const cache = interaction.client.rulePageTitleCache || [];

        try {
            const matches = getRankedTitleMatches(focusedValue, cache, { category });
            const choices = matches.slice(0, 25).map(page => ({
                name: page.title,
                value: page.title,
            }));

            await interaction.respond(choices);
        } catch (error) {
            log.error({ error, focusedValue, category }, 'Autocomplete error');
            await interaction.respond([]);
        }
    },

    async execute(interaction) {
        const query = interaction.options.getString('suche');
        const category = interaction.options.getString('kategorie') || null;
        const limit = interaction.options.getInteger('anzahl') || 3;
        const visible = interaction.options.getBoolean('visible') || false;

        await interaction.deferReply({ ephemeral: !visible });

        try {
            const cache = interaction.client.rulePageTitleCache || [];
            const { selectedPage, exactMatches, semanticMatches } = await hybridSearch(query, cache, {
                category,
                limit,
                threshold: 0.4,
            });

            // No results at all
            if (!selectedPage) {
                const noResultEmbed = new EmbedBuilder()
                    .setColor(0x95a5a6)
                    .setTitle('📖 Regelsuche')
                    .setDescription(
                        `Keine Ergebnisse für **„${query}"**${category ? ` in *${formatCategoryLabel(category)}*` : ''}.\n\nVersuche andere Suchbegriffe oder entferne den Kategoriefilter.`
                    )
                    .setFooter({ text: 'DSA 5 Regelwiki · Semantische Suche' });

                return interaction.editReply({ embeds: [noResultEmbed] });
            }

            // Build primary embed for selected page
            const pageTitle = selectedPage.title || 'Unbenannt';
            const pageContent =
                selectedPage.chunk_text || selectedPage.normalized_content || selectedPage.content || '';
            const pageSourceUrl = selectedPage.source_url;

            // Truncate preview to 1500 chars at word boundary
            const preview = truncate(pageContent, 1500);

            const primaryEmbed = new EmbedBuilder()
                .setColor(0x8b4513)
                .setTitle(pageSourceUrl ? `[${pageTitle}](${pageSourceUrl})` : pageTitle)
                .setDescription(preview || '*Kein Inhalt verfügbar.*');

            // Add fields for exact and semantic matches
            const fields = [];

            // Exact matches field (up to 3 linked titles)
            if (exactMatches.length > 0) {
                const exactLines = exactMatches.map(match => {
                    return match.source_url ? `[${match.title}](${match.source_url})` : match.title;
                });
                fields.push({
                    name: '🎯 Exakte Treffer',
                    value: exactLines.join('\n'),
                    inline: false,
                });
            }

            // Semantic matches field with relevance labels
            if (semanticMatches.length > 0) {
                const semanticLines = semanticMatches.map(match => {
                    const similarity = Math.round((match.similarity || 0) * 100);
                    const titleLink = match.source_url ? `[${match.title}](${match.source_url})` : match.title;
                    return `${titleLink} (${similarity}%)`;
                });
                fields.push({
                    name: '🔍 Semantische Treffer',
                    value: semanticLines.join('\n'),
                    inline: false,
                });
            }

            if (fields.length > 0) {
                primaryEmbed.addFields(fields);
            }

            primaryEmbed
                .setFooter({
                    text: `DSA 5 Regelwiki · ${interaction.user.username}`,
                    iconURL: interaction.user.avatarURL(),
                })
                .setTimestamp();

            // Build response with optional link button
            const components = [];

            if (pageSourceUrl) {
                const linkButton = new ButtonBuilder()
                    .setLabel('Im Regelwiki öffnen')
                    .setStyle(ButtonStyle.Link)
                    .setURL(pageSourceUrl);

                const actionRow = new ActionRowBuilder().addComponents(linkButton);
                components.push(actionRow);
            }

            return interaction.editReply({
                embeds: [primaryEmbed],
                components: components.length > 0 ? components : undefined,
            });
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
