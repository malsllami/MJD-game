// مسؤولية الملف: البيانات الأولية للعبة — تُكتب في الجداول الفارغة أو الناقصة فقط، وبعدها يُعدَّل كل شيء من الشيت
// File responsibility: initial game data — written only into empty or incomplete tables; afterwards everything is edited in the sheet

/**
 * مقياس العاصمة والعالم: كل مربع 50 × 50 مترًا، والعاصمة الأولى نحو 2 × 2 كم داخل عالم 8 × 8 كم
 * يستخدمه الإعداد الأول وكذلك applyCapitalScale لقاعدة بيانات قائمة، حتى تبقى القيم متطابقة
 * Capital and world scale: each tile is 50 × 50 m; the first capital is about 2 × 2 km inside an 8 × 8 km world.
 * Used by the first setup and by applyCapitalScale for an existing database, so the values stay identical.
 */
const CAPITAL_SCALE = {
  world: { tilesX: 160, tilesZ: 160, vertsPerTile: 2, heightScale: 30, noiseScale: 0.035, islandFalloff: 0.22, annexBlockSize: 10 },
  stageRadius: { village: 20, town: 28, city: 40 },
};

/**
 * البداية المتقاربة: قرية 13 × 13 مربعًا، وأرض مسطحة أضيق، وقطع ضم أصغر؛ يستخدمه الإعداد الأول وapplyCompactVillage
 * The compact start: a 13 × 13 village, a narrower flat zone, smaller annex parcels; used by the first setup and applyCompactVillage
 */
const COMPACT_VILLAGE = {
  world: { flatZoneRadius: 8, annexBlockSize: 4 },
  stageRadius: { village: 6, town: 12, city: 20 },
};

/** قيم إعدادات العالم الأولية حسب الحقل / Initial world settings by field */const SEED_WORLD = {
  seed: 1447,
  tilesX: CAPITAL_SCALE.world.tilesX,
  tilesZ: CAPITAL_SCALE.world.tilesZ,
  tileSize: 4,
  vertsPerTile: CAPITAL_SCALE.world.vertsPerTile,
  seaLevel: 0.42,
  heightScale: CAPITAL_SCALE.world.heightScale,
  depthScale: 12,
  noiseScale: CAPITAL_SCALE.world.noiseScale,
  moistureScale: 0.045,
  islandFalloff: CAPITAL_SCALE.world.islandFalloff,
  nationName: 'دولتي',
  capitalName: 'العاصمة',
  capitalTerrain: 'coast, plain',
  defaultQuality: 'auto',
  startSiteCount: 4,
  populationGrowthPerMinute: 6,
  maxConcurrentBuilds: 2,
  moveCostPercent: 25,
  demolishRefundPercent: 50,
  dayLengthMinutes: 24,
  offlineCapHours: 8,
  annexResource: 'gold',
  annexCost: 150,
  annexBlockSize: COMPACT_VILLAGE.world.annexBlockSize,
  flatZoneRadius: COMPACT_VILLAGE.world.flatZoneRadius,
  massifCount: 14,
  massifRadius: 10,
  lakeCount: 10,
  lakeRadius: 5,
  discoveryRadius: 6,
  surveyRadius: 12,
  surveyResource: 'gold',
  surveyCost: 200,
  governmentName: 'مبنى الحكم',
  worldMode: 'flat',
  marketBuilding: 'market',
  developmentBuilding: 'development_center',
};

/**
 * المباني: [المعرف، الاسم، الفئة، التضاريس، المدة بالثواني، التقنية، المرحلة، السكان المضافون، النموذج، يتطلب طريق، يتطلب مكمن]
 * أول 12 مبنى من الإعداد الأول بنفس ترتيبها، والبقية من إضافة تطور القرية
 * Buildings: the first 12 come from the first setup in the same order; the rest from the village progression addition
 */
const SEED_BUILDINGS = [
  ['farm', 'مزرعة', 'economy', 'plain', 20, '', 'village', 0, 'field', false, ''],
  ['lumber_camp', 'معسكر حطابين', 'economy', 'plain', 25, '', 'village', 0, 'industry', false, 'wood'],
  ['mine', 'منجم', 'economy', 'mountain, plateau', 45, '', 'town', 0, 'industry', false, 'iron'],
  ['oil_field', 'حقل نفط', 'economy', 'desert', 90, '', 'city', 0, 'industry', false, 'oil'],
  ['houses', 'مساكن', 'housing', 'plain, coast, plateau', 30, '', 'village', 12, 'house', true, ''],
  ['road', 'طريق', 'transport', 'coast, plain, desert, plateau, mountain', 5, '', 'village', 0, 'road', false, ''],
  ['port', 'ميناء', 'transport', 'coast', 180, '', 'city', 0, 'industry', true, ''],
  ['airport', 'مطار', 'transport', 'plain, desert', 300, 'aviation', 'city', 0, 'civic', true, ''],
  ['police', 'مركز شرطة', 'security', 'plain, coast, desert, plateau', 60, '', 'town', 0, 'civic', true, ''],
  ['barracks', 'ثكنة', 'military', 'plain, desert, plateau', 90, '', 'city', 0, 'civic', true, ''],
  ['school', 'مدرسة', 'science', 'plain, coast, plateau', 60, '', 'town', 0, 'civic', true, ''],
  ['research_center', 'مركز أبحاث', 'science', 'plain, coast', 240, 'science_1', 'city', 0, 'civic', true, ''],
  // العصر البدائي (applyPrimitiveEra): التحلية والكهرباء والمباني السكنية تُفتح في البلدة / Primitive era: these open in the town
  ['water_desal', 'محطة تحلية', 'utilities', 'coast', 60, '', 'town', 0, 'utility', false, ''],
  ['power_plant', 'محطة كهرباء', 'utilities', 'plain, desert, coast, plateau', 90, '', 'town', 0, 'utility', false, ''],
  ['apartments', 'مبانٍ سكنية', 'housing', 'plain, coast, plateau', 60, '', 'town', 40, 'tower', true, ''],
  ['livestock', 'حظيرة مواشي', 'agriculture', 'plain, plateau', 40, '', 'village', 0, 'barn', false, ''],
  ['market', 'سوق', 'economy', 'plain, coast', 50, '', 'village', 0, 'civic', true, ''],
  ['civil_defense', 'دفاع مدني', 'security', 'plain, coast, desert, plateau', 70, '', 'town', 0, 'civic', true, ''],
  ['hospital', 'مستشفى', 'services', 'plain, coast, plateau', 120, '', 'town', 0, 'civic', true, ''],
  ['paved_road', 'طريق معبد', 'transport', 'coast, plain, desert, plateau, mountain', 10, '', 'town', 0, 'paved-road', false, ''],
  ['park', 'حديقة', 'services', 'plain, coast, plateau', 30, '', 'town', 0, 'park', false, ''],
  ['village_center', 'مركز القرية', 'government', 'plain, coast, plateau', 150, '', 'town', 0, 'civic', true, ''],
  ['governor_palace', 'قصر الحاكم', 'government', 'plain, coast, plateau', 300, '', 'city', 0, 'palace', true, ''],
  ['finance_center', 'مركز المالية', 'government', 'plain, coast, plateau', 200, '', 'city', 0, 'tower', true, ''],
  ['factory', 'مصنع', 'industry', 'plain, desert, plateau', 180, '', 'city', 0, 'industry', true, ''],
  ['train_station', 'محطة قطار', 'transport', 'plain, desert, plateau', 240, '', 'city', 0, 'civic', true, ''],
  ['military_base', 'قاعدة عسكرية', 'military', 'plain, desert, plateau', 240, '', 'city', 0, 'civic', true, ''],
  ['development_center', 'مركز تطوير القرية', 'government', 'plain, coast, plateau', 90, '', 'village', 0, 'civic', true, ''],
  ['military_command', 'مركز القيادة العسكرية', 'military', 'plain, desert, plateau', 180, '', 'town', 0, 'civic', true, ''],
  // إضافة مباني الموارد / Resource buildings addition
  ['sawmill', 'منجرة', 'economy', 'plain, plateau', 40, '', 'village', 0, 'sawmill', false, 'wood'],
  ['blacksmith', 'الحدادون', 'industry', 'plain, plateau, mountain', 60, '', 'village', 0, 'smithy', true, 'iron'],
  ['oil_prospector', 'منقبو النفط', 'economy', 'desert', 90, '', 'village', 0, 'oil-rig', false, 'oil'],
  ['gold_prospector', 'منقبو الذهب', 'economy', 'mountain, plateau', 80, '', 'village', 0, 'quarry', false, 'gold'],
  ['stone_prospector', 'منقبو الحجارة', 'economy', 'mountain, plateau, desert', 50, '', 'village', 0, 'quarry', false, 'stone'],
  // إضافة العالم والمكامن / World and deposits addition
  ['copper_prospector', 'منقبو النحاس', 'economy', 'mountain, plateau', 80, '', 'village', 0, 'quarry', false, 'copper'],
  ['silver_prospector', 'منقبو الفضة', 'economy', 'mountain, plateau', 90, '', 'village', 0, 'quarry', false, 'silver'],
  // إضافة العصر البدائي / Primitive era addition
  ['well', 'بئر', 'utilities', 'plain, coast, plateau, desert', 20, '', 'village', 0, 'well', false, ''],
  ['tent', 'خيمة', 'housing', 'plain, coast, plateau, desert', 10, '', 'village', 4, 'tent', false, ''],
  // إضافة الاقتصاد الحي: سكن لكل مهنة، والمخازن والبنك، والحديقة والسور والبوابة / Living economy: housing per trade, stores and bank, garden, wall and gate
  ['farmers_house', 'سكن المزارعين', 'housing', 'plain, coast, plateau', 25, '', 'village', 8, 'house-farmer', true, ''],
  ['carpenters_house', 'سكن النجارين', 'housing', 'plain, coast, plateau', 25, '', 'village', 6, 'house-carpenter', true, ''],
  ['smiths_house', 'سكن الحدادين', 'housing', 'plain, coast, plateau', 30, '', 'village', 4, 'house-smith', true, ''],
  ['miners_house', 'سكن المنقبين', 'housing', 'plain, coast, plateau, desert', 30, '', 'village', 6, 'house-miner', true, ''],
  ['traders_house', 'سكن التجار', 'housing', 'plain, coast, plateau', 30, '', 'village', 4, 'house-trader', true, ''],
  ['herders_house', 'سكن الرعاة', 'housing', 'plain, coast, plateau', 25, '', 'village', 4, 'house-herder', true, ''],
  ['farm_storage', 'مخزن المزارع', 'economy', 'plain, coast, plateau, desert', 40, '', 'village', 0, 'storage-farm', true, ''],
  ['materials_storage', 'مخزن المواد', 'economy', 'plain, coast, plateau, desert', 40, '', 'village', 0, 'storage-materials', true, ''],
  ['bank', 'البنك', 'economy', 'plain, coast, plateau', 60, '', 'village', 0, 'bank', true, ''],
  ['village_garden', 'حديقة القرية', 'services', 'plain, coast, plateau', 20, '', 'village', 0, 'garden', false, ''],
  ['wooden_wall', 'سور خشبي', 'security', 'plain, coast, plateau, desert', 8, '', 'village', 0, 'wall', false, ''],
  ['gate', 'بوابة', 'security', 'plain, coast, plateau, desert', 15, '', 'village', 0, 'gate', false, ''],
  ['pond', 'بحيرة', 'utilities', 'plain, coast, plateau', 30, '', 'village', 0, 'pond', false, ''],
  ['stream', 'جدول', 'utilities', 'plain, coast, plateau', 6, '', 'village', 0, 'stream', false, ''],
];

/** المهن: [المعرف، الاسم، الأيقونة، اللون] / Trades: [id, name, icon, colour] */
const SEED_PROFESSIONS = [
  ['farmer', 'مزارع', 'food', '#b6d77a'], ['carpenter', 'نجار', 'wood', '#c99a63'], ['smith', 'حداد', 'iron', '#9fb1c4'],
  ['miner', 'منقب', 'stone', '#b9b3a8'], ['trader', 'تاجر', 'gold', '#e9c46a'], ['herder', 'راعٍ', 'food', '#8fbf6a'], ['laborer', 'عامل', 'build', '#d8c69a'],
];

/**
 * المهنة والعمال وشروط الفتح لكل مبنى: [المهنة، عدد العمال، السكان المطلوبون، المباني المطلوبة]
 * للسكن: المهنة هي مهنة سكانه، وعدد العمال صفر
 * Trade, workers and unlock conditions per building: [trade, workers, required population, required buildings]
 * For housing the trade is its residents' trade, with zero workers
 */
const SEED_JOBS = {
  farm: ['farmer', 4, 0, ''], lumber_camp: ['carpenter', 3, 0, ''], sawmill: ['carpenter', 3, 0, 'lumber_camp'],
  blacksmith: ['smith', 2, 20, ''], mine: ['miner', 3, 0, ''], oil_field: ['miner', 3, 0, ''],
  oil_prospector: ['miner', 2, 0, ''], gold_prospector: ['miner', 2, 0, ''], stone_prospector: ['miner', 2, 0, ''],
  copper_prospector: ['miner', 2, 0, ''], silver_prospector: ['miner', 2, 0, ''],
  livestock: ['herder', 2, 15, 'farm'], market: ['trader', 2, 20, ''], development_center: ['', 0, 30, 'market'],
  well: ['laborer', 1, 0, ''], water_desal: ['laborer', 3, 0, ''], power_plant: ['laborer', 3, 0, ''],
  factory: ['laborer', 8, 0, ''], port: ['laborer', 6, 0, ''],
  houses: ['laborer', 0, 0, ''], tent: ['laborer', 0, 0, ''], apartments: ['laborer', 0, 0, ''],
  farmers_house: ['farmer', 0, 0, ''], carpenters_house: ['carpenter', 0, 0, ''], smiths_house: ['smith', 0, 10, ''],
  miners_house: ['miner', 0, 0, ''], traders_house: ['trader', 0, 15, ''], herders_house: ['herder', 0, 10, ''],
  farm_storage: ['', 0, 0, 'farm'], materials_storage: ['', 0, 10, ''], bank: ['', 0, 40, 'market'],
  village_garden: ['', 0, 25, ''], wooden_wall: ['', 0, 30, 'development_center'], gate: ['', 0, 30, 'development_center'],
  pond: ['', 0, 10, ''], stream: ['', 0, 10, ''],
};

/** مباني إضافة الاقتصاد الحي / Buildings of the living economy addition */
const SEED_ECONOMY_IDS = ['farmers_house', 'carpenters_house', 'smiths_house', 'miners_house', 'traders_house', 'herders_house', 'farm_storage', 'materials_storage', 'bank', 'village_garden', 'wooden_wall', 'gate', 'pond', 'stream'];
const SEED_ECONOMY_COSTS = [
  ['farmers_house', 'wood', 80], ['farmers_house', 'stone', 40], ['carpenters_house', 'wood', 90], ['carpenters_house', 'stone', 40],
  ['smiths_house', 'wood', 80], ['smiths_house', 'stone', 80], ['miners_house', 'wood', 90], ['miners_house', 'stone', 50],
  ['traders_house', 'wood', 100], ['traders_house', 'stone', 80], ['traders_house', 'gold', 50], ['herders_house', 'wood', 80], ['herders_house', 'stone', 30],
  ['farm_storage', 'wood', 200], ['farm_storage', 'stone', 80], ['materials_storage', 'wood', 200], ['materials_storage', 'stone', 120],
  ['bank', 'stone', 300], ['bank', 'gold', 200], ['village_garden', 'wood', 40], ['village_garden', 'gold', 20],
  ['wooden_wall', 'wood', 10], ['gate', 'wood', 40], ['gate', 'stone', 20], ['pond', 'stone', 60], ['pond', 'gold', 40], ['stream', 'stone', 6],
];
/** إنتاج مباني الإضافة: البحيرة تمد الدولة بالماء / Production of the addition's buildings: the lake supplies water */
const SEED_ECONOMY_PRODUCTION = [['pond', 'water', 5]];
const SEED_ECONOMY_CONSUMPTION = [
  ['farmers_house', 'food', 1], ['carpenters_house', 'food', 1], ['smiths_house', 'food', 1], ['miners_house', 'food', 1],
  ['traders_house', 'food', 1], ['herders_house', 'food', 1], ['farmers_house', 'water', 1], ['miners_house', 'water', 1],
];
/** سعة المخازن: [المبنى، المورد، السعة] / Store capacities: [building, resource, capacity] */
const SEED_STORAGE = [
  ['farm_storage', 'food', 2000], ['materials_storage', 'wood', 2000], ['materials_storage', 'stone', 2000], ['materials_storage', 'iron', 1000],
  ['materials_storage', 'oil', 500], ['bank', 'gold', 5000], ['bank', 'copper', 1000], ['bank', 'silver', 1000],
];
/** السعة الأساسية لكل مورد قبل بناء أي مخزن / Base capacity per resource before any store */
const SEED_BASE_CAPACITY = { food: 600, wood: 600, stone: 600, iron: 300, oil: 200, gold: 1500, water: 800, power: 500, copper: 200, silver: 200 };
/** أسعار السوق بالذهب: [المورد، سعر الشراء، سعر البيع] / Market prices in gold: [resource, buy, sell] */
const SEED_PRICES = [['food', 3, 1], ['wood', 4, 2], ['stone', 4, 2], ['iron', 10, 6], ['oil', 14, 8], ['copper', 12, 7], ['silver', 18, 11]];
/** شروط الترقية لكل مرحلة: [المباني المطلوبة، تكلفة الترقية] / Upgrade conditions per stage: [required buildings, upgrade cost] */
const SEED_STAGE_UPGRADE = {
  village: ['', ''],
  town: ['development_center, market, houses, farmers_house, carpenters_house, smiths_house, miners_house, traders_house, herders_house', 'gold:500, wood:400, stone:400'],
  city: ['village_center, school, hospital, police', 'gold:2000, stone:1500, iron:500'],
};

/** صفوف إضافة العصر البدائي: [المبنى، المورد، الكمية] / Rows of the primitive era addition */
const SEED_PRIMITIVE_IDS = ['well', 'tent'];
const SEED_PRIMITIVE_COSTS = [['well', 'wood', 40], ['well', 'stone', 30], ['tent', 'wood', 20]];
const SEED_PRIMITIVE_PRODUCTION = [['well', 'water', 8]];
const SEED_PRIMITIVE_CONSUMPTION = [['tent', 'food', 1]];

/**
 * تعديل العصر البدائي على قاعدة قائمة: مبانٍ تُنقل إلى البلدة، ووصف القرية الجديد
 * The primitive era edit on an existing database: buildings moved to the town, and the new village description
 */
const PRIMITIVE_ERA = {
  buildingStages: { water_desal: 'town', power_plant: 'town', apartments: 'town' },
  villageDescription: 'بداية الدولة: الخيام والأكواخ والطرق الترابية والآبار والزراعة والسوق',
};

/** صفوف إضافة العالم والمكامن: [المبنى، المورد، الكمية] / Rows of the world and deposits addition */
const SEED_DEPOSIT_COSTS = [['copper_prospector', 'wood', 150], ['copper_prospector', 'iron', 30], ['silver_prospector', 'wood', 180], ['silver_prospector', 'iron', 40]];
const SEED_DEPOSIT_PRODUCTION = [['copper_prospector', 'copper', 15], ['silver_prospector', 'silver', 10]];

/**
 * أنواع المكامن: [المعرف، الاسم، المورد، المكان، العدد في العالم، الأيقونة، اللون]
 * المكان: mountain سلسلة جبلية، forest غابة، desert صحراء
 * Deposit types: place is mountain (a range), forest or desert
 */
const SEED_DEPOSIT_TYPES = [
  ['iron_ore', 'منجم حديد', 'iron', 'mountain', 3, 'iron', '#9fb1c4'],
  ['gold_ore', 'منجم ذهب', 'gold', 'mountain', 2, 'gold', '#e9c46a'],
  ['copper_ore', 'منجم نحاس', 'copper', 'mountain', 2, 'copper', '#c97a4a'],
  ['silver_ore', 'منجم فضة', 'silver', 'mountain', 2, 'silver', '#cfd6dc'],
  ['stone_quarry', 'محجر', 'stone', 'mountain', 3, 'stone', '#b9b3a8'],
  ['oil_field', 'حقل نفط', 'oil', 'desert', 3, 'oil', '#8494a6'],
  ['forest', 'غابة', 'wood', 'forest', 8, 'wood', '#5f9445'],
];

/** صفوف إضافة مباني الموارد: [المبنى، المورد، الكمية] / Rows of the resource buildings addition */
const SEED_RESOURCE_COSTS = [
  ['sawmill', 'gold', 150], ['sawmill', 'stone', 50], ['blacksmith', 'wood', 150], ['blacksmith', 'stone', 100],
  ['oil_prospector', 'wood', 200], ['oil_prospector', 'iron', 50], ['gold_prospector', 'wood', 150], ['gold_prospector', 'iron', 30],
  ['stone_prospector', 'wood', 100],
];
const SEED_RESOURCE_PRODUCTION = [
  ['sawmill', 'wood', 35], ['blacksmith', 'iron', 15], ['oil_prospector', 'oil', 10], ['gold_prospector', 'gold', 20], ['stone_prospector', 'stone', 30],
];
const SEED_RESOURCE_CONSUMPTION = [['blacksmith', 'wood', 4]];

/** أوامر أي مبنى عام / Commands for a generic building */
const SEED_BUILDING_COMMANDS = cmds_('building', [
  ['info', 'معلومات', 'info'], ['move', 'نقل', 'move'], ['demolish', 'هدم', 'demolish'], ['upgrade', 'ترقية', 'up'], ['road', 'طريق', 'road'],
]);

/** صفوف الجداول الأولية بأسماء الأعمدة العربية / Initial table rows keyed by Arabic column names */
const SEED_ROWS = {
  terrain: [
    t_('deep_water', 'مياه عميقة', '#1b4a66', 0, 0, 0.32, 0, 1, true, false),
    t_('shallow_water', 'مياه ضحلة', '#2c7a8c', 1, 0.32, 0.42, 0, 1, true, false),
    t_('coast', 'ساحل', '#d8c69a', 2, 0.42, 0.5, 0, 1, false, true),
    t_('desert', 'صحراء', '#cfb27b', 3, 0.42, 0.62, 0, 0.4, false, false),
    t_('plain', 'سهل', '#6c8d4a', 4, 0.42, 0.62, 0.4, 1, false, false),
    t_('plateau', 'هضبة', '#9b8556', 5, 0.62, 0.74, 0, 1, false, false),
    t_('mountain', 'جبال', '#7a7166', 6, 0.74, 0.93, 0, 1, false, false),
    t_('peak', 'قمم', '#e4e7e3', 7, 0.93, 1, 0, 1, false, false),
  ],
  resources: [
    ['food', 'غذاء', 'food', '#b6d77a', 500], ['wood', 'خشب', 'wood', '#c99a63', 400], ['stone', 'حجر', 'stone', '#b9b3a8', 300],
    ['iron', 'حديد', 'iron', '#9fb1c4', 100], ['oil', 'نفط', 'oil', '#8494a6', 0], ['gold', 'ذهب', 'gold', '#e9c46a', 1000],
    ['water', 'ماء', 'water', '#6fb7d6', 150], ['power', 'كهرباء', 'power', '#f2d35b', 0],
    ['copper', 'نحاس', 'copper', '#c97a4a', 0], ['silver', 'فضة', 'silver', '#cfd6dc', 0],
  ].map(function (r, i) {
    return { 'المعرف': r[0], 'الاسم': r[1], 'الأيقونة': r[2], 'اللون': r[3], 'الكمية الابتدائية': r[4], 'الترتيب': i + 1, 'السعة الأساسية': SEED_BASE_CAPACITY[r[0]] };
  }),
  buildingCategories: [
    ['economy', 'الاقتصاد'], ['housing', 'الإسكان'], ['transport', 'النقل'], ['security', 'الأمن'], ['military', 'الجيش'], ['science', 'العلوم'],
    ['utilities', 'المرافق'], ['agriculture', 'الزراعة'], ['services', 'الخدمات'], ['government', 'الحكومة'], ['industry', 'الصناعة'],
  ].map(function (c, i) { return { 'المعرف': c[0], 'الاسم': c[1], 'الترتيب': i + 1 }; }),
  buildings: SEED_BUILDINGS.map(function (b, i) {
    return {
      'المعرف': b[0], 'الاسم': b[1], 'الفئة': b[2], 'التضاريس المسموحة': b[3], 'مدة البناء بالثواني': b[4], 'التقنية المطلوبة': b[5],
      'الترتيب': i + 1, 'المرحلة المطلوبة': b[6], 'السكان المضافون': b[7], 'النموذج': b[8], 'يتطلب طريق': b[9], 'يتطلب مكمن': b[10] || '',
      'المهنة': (SEED_JOBS[b[0]] || [''])[0], 'عدد العمال': (SEED_JOBS[b[0]] || ['', 0])[1],
      'السكان المطلوبون': (SEED_JOBS[b[0]] || ['', 0, 0])[2], 'المباني المطلوبة': (SEED_JOBS[b[0]] || ['', 0, 0, ''])[3],
    };
  }),
  buildingCosts: amounts_('الكمية', [
    ['farm', 'wood', 80], ['lumber_camp', 'gold', 100], ['mine', 'wood', 200], ['oil_field', 'iron', 400],
    ['houses', 'stone', 120], ['houses', 'wood', 60], ['road', 'stone', 20], ['port', 'wood', 900],
    ['airport', 'stone', 1500], ['airport', 'iron', 600], ['police', 'gold', 300],
    ['barracks', 'stone', 400], ['barracks', 'gold', 200], ['school', 'stone', 200], ['school', 'gold', 150],
    ['research_center', 'stone', 800], ['research_center', 'gold', 600],
    ['water_desal', 'stone', 150], ['water_desal', 'wood', 100], ['power_plant', 'stone', 250], ['power_plant', 'iron', 60],
    ['apartments', 'stone', 300], ['apartments', 'wood', 120], ['livestock', 'wood', 150], ['market', 'wood', 200], ['market', 'stone', 100],
    ['civil_defense', 'stone', 250], ['civil_defense', 'gold', 200], ['hospital', 'stone', 500], ['hospital', 'gold', 400],
    ['paved_road', 'stone', 40], ['paved_road', 'gold', 10], ['park', 'wood', 80], ['park', 'gold', 50],
    ['village_center', 'stone', 600], ['village_center', 'gold', 500], ['governor_palace', 'stone', 1500], ['governor_palace', 'gold', 1500],
    ['finance_center', 'stone', 900], ['finance_center', 'gold', 800], ['factory', 'stone', 800], ['factory', 'iron', 300],
    ['train_station', 'stone', 1200], ['train_station', 'iron', 500],
    ['military_base', 'stone', 1500], ['military_base', 'iron', 600], ['military_base', 'gold', 800],
    ['development_center', 'stone', 200], ['development_center', 'wood', 150], ['development_center', 'gold', 200],
    ['military_command', 'stone', 600], ['military_command', 'iron', 200], ['military_command', 'gold', 400],
  ].concat(SEED_RESOURCE_COSTS, SEED_DEPOSIT_COSTS, SEED_PRIMITIVE_COSTS, SEED_ECONOMY_COSTS)),
  buildingProduction: amounts_('الكمية في الدقيقة', [
    ['farm', 'food', 30], ['lumber_camp', 'wood', 24], ['mine', 'stone', 18], ['mine', 'iron', 8], ['oil_field', 'oil', 6],
    ['port', 'gold', 30], ['port', 'food', 10], ['water_desal', 'water', 25], ['power_plant', 'power', 25],
    ['livestock', 'food', 25], ['market', 'gold', 30], ['finance_center', 'gold', 60], ['factory', 'gold', 70],
  ].concat(SEED_RESOURCE_PRODUCTION, SEED_DEPOSIT_PRODUCTION, SEED_PRIMITIVE_PRODUCTION, SEED_ECONOMY_PRODUCTION)),
  buildingConsumption: amounts_('الكمية في الدقيقة', [
    ['houses', 'food', 2], ['houses', 'water', 1], ['apartments', 'water', 3], ['apartments', 'power', 3], ['apartments', 'food', 4],
    ['livestock', 'water', 2], ['market', 'food', 8], ['civil_defense', 'power', 1], ['hospital', 'water', 2], ['hospital', 'power', 3],
    ['park', 'water', 1], ['finance_center', 'power', 3], ['factory', 'power', 6], ['factory', 'iron', 2],
  ].concat(SEED_RESOURCE_CONSUMPTION, SEED_PRIMITIVE_CONSUMPTION, SEED_ECONOMY_CONSUMPTION)),
  depositTypes: SEED_DEPOSIT_TYPES.map(function (d) {
    return { 'المعرف': d[0], 'الاسم': d[1], 'معرف المورد': d[2], 'المكان': d[3], 'العدد في العالم': d[4], 'الأيقونة': d[5], 'اللون': d[6] };
  }),
  stages: [
    ['village', 'قرية', 0, COMPACT_VILLAGE.stageRadius.village, PRIMITIVE_ERA.villageDescription],
    ['town', 'بلدة', 150, COMPACT_VILLAGE.stageRadius.town, 'الخدمات العامة والأمن وتطوير الطرق ومركز القرية'],
    ['city', 'مدينة', 600, COMPACT_VILLAGE.stageRadius.city, 'الحكومة والصناعة والميناء والمطار والقطار والقواعد العسكرية'],
  ].map(function (s, i) {
    return {
      'المعرف': s[0], 'الاسم': s[1], 'الترتيب': i + 1, 'السكان المطلوبون': s[2], 'نصف قطر الحدود': s[3], 'الوصف': s[4],
      'المباني المطلوبة': SEED_STAGE_UPGRADE[s[0]][0], 'تكلفة الترقية': SEED_STAGE_UPGRADE[s[0]][1],
    };
  }),
  professions: SEED_PROFESSIONS.map(function (p) { return { 'المعرف': p[0], 'الاسم': p[1], 'الأيقونة': p[2], 'اللون': p[3] }; }),
  storage: SEED_STORAGE.map(function (s) { return { 'معرف المبنى': s[0], 'معرف المورد': s[1], 'السعة': s[2] }; }),
  marketPrices: SEED_PRICES.map(function (p) { return { 'معرف المورد': p[0], 'سعر الشراء': p[1], 'سعر البيع': p[2] }; }),
  ministries: [
    ['finance', 'المالية', 'الموارد والميزانية والضرائب'],
    ['interior', 'الداخلية', 'السكان والأمن الداخلي والرضا'],
    ['defense', 'الدفاع', 'الجيش والعتاد والتجنيد'],
    ['foreign', 'الخارجية', 'العلاقات والتحالفات والتجارة الدولية'],
    ['science', 'العلوم', 'الأبحاث وشجرة التقنية'],
    ['housing', 'الإسكان', 'الأراضي والمدن والقرى'],
  ].map(function (m, i) { return { 'المعرف': m[0], 'الاسم': m[1], 'الوصف': m[2], 'الترتيب': i + 1 }; }),
  contextCommands: [].concat(
    cmds_('city', [['build', 'بناء', 'build'], ['upgrade', 'ترقية', 'up'], ['taxes', 'ضرائب', 'gold'], ['tasks', 'مهام السكان', 'pop'], ['roads', 'طرق', 'road']]),
    cmds_('empty_tile', [['build', 'بناء', 'build'], ['annex', 'ضم للدولة', 'map'], ['road', 'طريق', 'road'], ['survey', 'مسح الموارد', 'lab'], ['info', 'معلومات', 'info']]),
    cmds_('mine', [['upgrade', 'ترقية', 'up'], ['workers', 'العمال', 'pop'], ['road', 'طريق', 'road'], ['protect', 'حماية', 'shield'], ['output', 'الإنتاج', 'iron']]),
    cmds_('port', [['trade', 'تجارة', 'trade'], ['transport', 'نقل', 'road'], ['upgrade', 'ترقية', 'up'], ['protect', 'حماية', 'shield'], ['traffic', 'الحركة', 'info']]),
    cmds_('unit', [['move', 'تحرك', 'map'], ['attack', 'هجوم', 'army'], ['defend', 'دفاع', 'shield'], ['reinforce', 'تعزيز', 'pop'], ['merge', 'دمج', 'ally']]),
    cmds_('nation', [['message', 'رسالة', 'info'], ['trade', 'تجارة', 'trade'], ['alliance', 'تحالف', 'ally'], ['sanctions', 'عقوبات', 'shield'], ['war', 'إعلان حرب', 'army']]),
    SEED_BUILDING_COMMANDS
  ),
};

/** صف تضاريس / Terrain row */
function t_(id, name, color, priority, minE, maxE, minM, maxM, isWater, needsWater) {
  return {
    'المعرف': id, 'الاسم': name, 'اللون': color, 'الأولوية': priority,
    'أدنى ارتفاع': minE, 'أعلى ارتفاع': maxE, 'أدنى رطوبة': minM, 'أعلى رطوبة': maxM,
    'مائي': isWater, 'يتطلب مجاورة الماء': needsWater,
  };
}

/** صفوف (مبنى، مورد، كمية) / (building, resource, amount) rows */
function amounts_(amountColumn, list) {
  return list.map(function (a) {
    const row = { 'معرف المبنى': a[0], 'معرف المورد': a[1] };
    row[amountColumn] = a[2];
    return row;
  });
}

/** أوامر نوع عنصر / Commands of one entity type */
function cmds_(entityType, list) {
  return list.map(function (c, i) {
    return { 'نوع العنصر': entityType, 'المعرف': c[0], 'الاسم': c[1], 'الأيقونة': c[2], 'الترتيب': i + 1 };
  });
}
