const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show available commands and usage information')
        .addStringOption(option =>
            option
                .setName('category')
                .setDescription('Category to get help for')
                .setRequired(false)
                .addChoices(
                    { name: 'Character', value: 'character' },
                    { name: 'Combat', value: 'combat' },
                    { name: 'Items & Inventory', value: 'items' },
                    { name: 'Weapons', value: 'weapons' },
                    { name: 'Skills', value: 'skills' },
                    { name: 'Mobs (DM)', value: 'mobs' },
                    { name: 'Regelwiki', value: 'regelwiki' },
                    { name: 'Utility', value: 'utility' }
                )
        ),

    async execute(interaction) {
        const category = interaction.options.getString('category');

        if (category) {
            return interaction.reply({
                embeds: [getCategoryHelp(category)],
                ephemeral: true,
            });
        }

        const helpEmbed = new EmbedBuilder()
            .setColor(0x2f3136)
            .setTitle('📚 DSA Bot Help')
            .setDescription('A Discord bot for **DSA (Das Schwarze Auge) 5th Edition** combat management.')
            .addFields(
                {
                    name: '👤 Character',
                    value: '`/create-character` `/choose-character` `/show-stats` `/edit-stats` `/upload-avatar` `/delete-character`',
                    inline: false,
                },
                {
                    name: '⚔️ Combat',
                    value: '`/start-combat` `/end-combat` `/park-combat` `/resume-combat` `/attack` `/evade` `/use-skill`',
                    inline: false,
                },
                {
                    name: '🎒 Items & Inventory',
                    value: '`/show-items` `/add-item` `/remove-item` `/use-item` `/heal`',
                    inline: false,
                },
                {
                    name: '🗡️ Weapons',
                    value: '`/show-weapons` `/add-weapon` `/equip-weapon` `/delete-weapon`',
                    inline: false,
                },
                {
                    name: '📋 Skills',
                    value: '`/show-skills` `/edit-skills`',
                    inline: false,
                },
                {
                    name: '👾 Mobs (DM Only)',
                    value: '`/add-mob` `/edit-mob` `/show-mob` `/list-mobs`',
                    inline: false,
                },
                {
                    name: '📖 Regelwiki',
                    value: '`/regel`',
                    inline: false,
                },
                {
                    name: '🎲 Utility',
                    value: '`/roll` `/help`',
                    inline: false,
                }
            )
            .setFooter({ text: 'Use /help <category> for detailed information on a category.' });

        return interaction.reply({ embeds: [helpEmbed], ephemeral: true });
    },
};

function getCategoryHelp(category) {
    const categories = {
        character: new EmbedBuilder()
            .setColor(0x2f3136)
            .setTitle('👤 Character Commands')
            .setDescription('Manage your DSA character')
            .addFields(
                { name: '/create-character', value: 'Create a new character' },
                { name: '/choose-character', value: 'Select which of your characters to play' },
                { name: '/show-stats', value: "View your character's stats and health" },
                { name: '/edit-stats', value: 'Interactively edit your stats' },
                { name: '/upload-avatar', value: 'Upload a custom character avatar' },
                { name: '/delete-character', value: 'Permanently delete a character' }
            ),

        combat: new EmbedBuilder()
            .setColor(0x2f3136)
            .setTitle('⚔️ Combat Commands')
            .setDescription('Combat encounter management')
            .addFields(
                { name: '/start-combat', value: 'Initialize a new combat encounter (DM)' },
                { name: '/end-combat', value: 'End the current combat session' },
                { name: '/park-combat', value: 'Pause combat to resume later' },
                { name: '/resume-combat', value: 'Resume a paused combat session' },
                { name: '/attack', value: 'Make an attack roll' },
                { name: '/evade', value: 'Attempt to dodge an attack' },
                { name: '/use-skill', value: 'Use a combat skill/maneuver' }
            ),

        items: new EmbedBuilder()
            .setColor(0x2f3136)
            .setTitle('🎒 Items & Inventory Commands')
            .setDescription('Manage your inventory')
            .addFields(
                { name: '/show-items', value: 'View your inventory' },
                { name: '/add-item', value: 'Add an item to your inventory' },
                { name: '/remove-item', value: 'Remove an item from inventory' },
                { name: '/use-item', value: 'Use a consumable item (potions, food, etc.)' },
                { name: '/heal', value: 'Restore HP to your character (or another as DM)' }
            ),

        weapons: new EmbedBuilder()
            .setColor(0x2f3136)
            .setTitle('🗡️ Weapon Commands')
            .setDescription('Manage your weapons')
            .addFields(
                { name: '/show-weapons', value: 'View your equipped weapons' },
                { name: '/add-weapon', value: 'Add a new weapon to your character' },
                { name: '/equip-weapon', value: 'Equip a weapon to a slot' },
                { name: '/delete-weapon', value: 'Remove a weapon permanently' }
            ),

        skills: new EmbedBuilder()
            .setColor(0x2f3136)
            .setTitle('📋 Skill Commands')
            .setDescription('Combat skills and maneuvers')
            .addFields(
                { name: '/show-skills', value: 'View your assigned combat skills' },
                { name: '/edit-skills', value: 'Assign or unassign combat skills' }
            ),

        mobs: new EmbedBuilder()
            .setColor(0x2f3136)
            .setTitle('👾 Mob Commands (DM Only)')
            .setDescription('Create and manage NPC templates for combat')
            .addFields(
                { name: '/add-mob', value: 'Create a new mob template' },
                { name: '/edit-mob', value: 'Edit an existing mob template' },
                { name: '/show-mob', value: 'View mob template details' },
                { name: '/list-mobs', value: 'List all available mob templates' }
            ),

        regelwiki: new EmbedBuilder()
            .setColor(0x2f3136)
            .setTitle('📖 Regelwiki Commands')
            .setDescription('Search the DSA 5e rules database (7,000+ rules from the Regelwiki)')
            .addFields(
                { name: '/regel <suche>', value: 'Search rules by keyword (e.g., `/regel Finte`)' },
                {
                    name: '/regel <suche> kategorie:<filter>',
                    value: 'Filter by category (e.g., Bestiarium, Magie, Kampf-SF)',
                },
                { name: '/regel <suche> anzahl:5', value: 'Show up to 5 results (default 3)' },
                {
                    name: '/regel <suche> visible:true',
                    value: 'Make the search results visible to everyone',
                }
            ),

        utility: new EmbedBuilder()
            .setColor(0x2f3136)
            .setTitle('🎲 Utility Commands')
            .setDescription('General utility commands')
            .addFields(
                { name: '/roll <dice>', value: 'Roll dice using DSA notation (e.g., `/roll 1w20`, `/roll 3w6+2`)' },
                { name: '/roll <dice> visible:true', value: 'Make the roll visible to everyone' },
                { name: '/help', value: 'Show this help message' },
                { name: '/help <category>', value: 'Get detailed help for a specific category' }
            ),
    };

    return categories[category] || categories.utility;
}
