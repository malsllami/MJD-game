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

/**
 * الغابة المحيطة: قرية أولى 9 × 9 مربعات (نصف قطر 4) بقدر منازلها ومواردها، وقطع غابة 3 × 3 تنتظم مع مجمع الحكم، وموارد البداية
 * أقرب؛ يستخدمه الإعداد الأول وapplyForestFrontier
 * The surrounding forest: a 9 × 9 first village (radius 4) just fitting its homes and resources, 3 × 3 forest parcels aligned with
 * the government compound, and closer starter resources; used by the first setup and applyForestFrontier
 */
const FOREST_FRONTIER = {
  world: { annexBlockSize: 3, starterDepositDistance: 3 },
  stageRadius: { village: 4 },
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
  annexBlockSize: FOREST_FRONTIER.world.annexBlockSize,
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
  adminZoneRadius: 2,
  residentialZoneRadius: 4,
  industrialRoadDistance: 1,
  governmentRadius: 1,
  starterDepositDistance: FOREST_FRONTIER.world.starterDepositDistance,
  clearingSeconds: 60,
  clearingWood: 120,
  frontierDepth: 10,
  frontierGap: 1,
  engineeringBuilding: 'engineering_office',
  engineeringMoveCostPercent: 0,
};

/**
 * ترتيب قوائم البناء: [المعرف، الاسم] بالترتيب الظاهر؛ والفئات الأخرى تبقى في الشيت وتختفي من القائمة إذ لا مباني فيها
 * The build menus: [id, name] in display order; the other categories stay in the sheet and vanish from the menu having no buildings
 */
const MENU_ORDER = [
  ['industry', 'الصناعة'], ['utilities', 'المرافق'], ['transport', 'النقل'], ['housing', 'السكن'], ['economy', 'الاقتصاد'], ['government', 'الحكم'],
];
/** فئة كل مبنى في القوائم / Each building's menu category */
const MENU_CATEGORIES = {
  industry: ['farm', 'livestock', 'lumber_camp', 'sawmill', 'blacksmith', 'mine', 'oil_field', 'oil_prospector', 'gold_prospector', 'stone_prospector',
    'copper_prospector', 'silver_prospector', 'well', 'water_desal', 'power_plant', 'factory'],
  utilities: ['torch', 'wooden_wall', 'gate', 'village_garden', 'park', 'paving_stone', 'paving_sand', 'pond', 'stream'],
  transport: ['road', 'paved_road', 'port', 'airport', 'train_station'],
  housing: ['houses', 'tent', 'apartments', 'farmers_house', 'carpenters_house', 'smiths_house', 'miners_house', 'traders_house', 'herders_house'],
  economy: ['market', 'bank', 'farm_storage', 'materials_storage'],
  government: ['development_center', 'engineering_office', 'village_center', 'governor_palace', 'finance_center', 'police', 'civil_defense', 'hospital',
    'school', 'research_center', 'barracks', 'military_base', 'military_command', 'foreign_ministry', 'alliance_house'],
};
/** فئة المبنى في القوائم، أو فئته الأصلية / A building's menu category, or its original one */
function menuCategory_(id, fallback) {
  const found = Object.keys(MENU_CATEGORIES).filter(function (c) { return MENU_CATEGORIES[c].indexOf(id) >= 0; })[0];
  return found || fallback;
}

/** مباني إضافة ترتيب القوائم / Buildings of the menu layout addition */
const SEED_MENU_IDS = ['torch', 'paving_stone', 'paving_sand', 'engineering_office', 'foreign_ministry', 'alliance_house'];
const SEED_MENU_COSTS = [
  ['torch', 'wood', 5], ['paving_stone', 'stone', 10], ['paving_sand', 'stone', 3], ['engineering_office', 'stone', 400], ['engineering_office', 'wood', 200],
  ['engineering_office', 'gold', 300], ['foreign_ministry', 'stone', 500], ['foreign_ministry', 'gold', 500], ['alliance_house', 'stone', 400], ['alliance_house', 'gold', 400],
];

/** السور والبوابة مفتوحان من البداية فيبني اللاعب سوره بنفسه / The wall and gate are open from the start so the player builds the wall himself */
const OPEN_WALLS = ['wooden_wall', 'gate'];

/**
 * موارد الغابة: [نوع المكمن، الاحتمال ٪، أدنى مستوى للحكم، أدنى غنى، أعلى غنى]. كل قطعة تُقطع تُسحب لها نتيجة واحدة، وما تبقى
 * من المئة أرض فارغة؛ والغنى يضرب إنتاج المنشأة المبنية على المكمن
 * Forest resources: [deposit type, chance %, minimum government level, minimum richness, maximum richness]. Each cleared parcel
 * draws one result, the rest of the hundred being empty land; richness multiplies the output of the facility built on the deposit
 */
const SEED_FRONTIER_RESOURCES = [
  ['gold_ore', 10, 1, 0.5, 1.4], ['silver_ore', 8, 1, 0.5, 1.4], ['stone_quarry', 14, 1, 0.7, 1.5], ['iron_ore', 12, 1, 0.6, 1.5],
  ['copper_ore', 10, 6, 0.6, 1.5], ['oil_field', 8, 10, 0.6, 1.6],
  // بقعة زراعية: المزرعة والحظيرة عليها تنتجان أكثر / An agricultural spot: a farm or barn on it produces more
  ['fertile_land', 16, 1, 1.2, 1.8],
];


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
  // إضافة ترتيب القوائم: الشعلات والبلاط، ومباني الحكم بعد المستوى الخامس / Menu layout: torches and paving, and government buildings after level five
  ['torch', 'شعلة', 'utilities', 'plain, coast, plateau, desert', 3, '', 'village', 0, 'torch', false, ''],
  ['paving_stone', 'بلاط حجري', 'utilities', 'plain, coast, plateau, desert', 4, '', 'village', 0, 'paving-stone', false, ''],
  ['paving_sand', 'بلاط رملي', 'utilities', 'plain, coast, plateau, desert', 3, '', 'village', 0, 'paving-sand', false, ''],
  ['engineering_office', 'المكتب الهندسي', 'government', 'plain, coast, plateau', 120, '', 'town', 0, 'civic', true, ''],
  ['foreign_ministry', 'الخارجية', 'government', 'plain, coast, plateau', 150, '', 'town', 0, 'civic', true, ''],
  ['alliance_house', 'دار التحالف', 'government', 'plain, coast, plateau', 150, '', 'town', 0, 'civic', true, ''],
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
  village_garden: ['', 0, 25, ''], wooden_wall: ['', 0, 0, ''], gate: ['', 0, 0, ''],
  pond: ['', 0, 10, ''], stream: ['', 0, 10, ''],
  torch: ['', 0, 0, ''], paving_stone: ['', 0, 0, ''], paving_sand: ['', 0, 0, ''],
  engineering_office: ['', 0, 0, ''], foreign_ministry: ['', 0, 0, ''], alliance_house: ['', 0, 0, ''],
};

/**
 * منطقة الاقتراح لكل مبنى: السكن قرب مبنى الحكم، والإدارة حوله، والورش والمخازن على الطرق، والمزارع على الأطراف.
 * المبنى غير المذكور بلا اقتراح (الطرق والأسوار ومنشآت المكامن وغيرها)
 * Suggested zone per building: housing near the government building, administration around it, workshops and stores on roads,
 * farms on the outskirts. Unlisted buildings get no suggestion (roads, walls, deposit facilities and others)
 */
const SEED_ZONES = {
  houses: 'residential', tent: 'residential', apartments: 'residential', farmers_house: 'residential', carpenters_house: 'residential',
  smiths_house: 'residential', miners_house: 'residential', traders_house: 'residential', herders_house: 'residential',
  development_center: 'administrative', village_center: 'administrative', governor_palace: 'administrative', finance_center: 'administrative',
  police: 'administrative', civil_defense: 'administrative', school: 'administrative', hospital: 'administrative', military_command: 'administrative',
  market: 'industrial', farm_storage: 'industrial', materials_storage: 'industrial', bank: 'industrial', factory: 'industrial', power_plant: 'industrial',
  farm: 'agricultural', livestock: 'agricultural',
  engineering_office: 'administrative', foreign_ministry: 'administrative', alliance_house: 'administrative',
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

/**
 * مستويات الحكم: [المستوى، الاسم، المرحلة، السكان، المباني المطلوبة، تكلفة الترقية، أقصى مستوى للمباني، طراز السور، الوصف]
 * المستويات 1–5 قرية خشبية، والسادس ينقل الدولة إلى البلدة الحجرية بشروطها، والسابع إلى المدينة
 * Government levels: 1–5 are the wooden village, the sixth moves the nation into the stone town with its conditions, the seventh into the city
 */
const SEED_GOVERNMENT_LEVELS = [
  [1, 'قرية ناشئة', 'village', 0, '', '', 1, 'stakes', 'أكواخ خشبية وإنتاج بدائي قليل'],
  [2, 'قرية', 'village', 20, '', 'gold:300, wood:200', 2, 'stakes', 'المباني تُرقّى إلى المستوى الثاني'],
  [3, 'قرية عامرة', 'village', 40, '', 'gold:500, wood:350, stone:150', 3, 'palisade', 'سور أوتاد أعلى بأبراج مراقبة'],
  [4, 'قرية مزدهرة', 'village', 70, 'market', 'gold:800, wood:500, stone:250', 4, 'palisade', 'المباني تُرقّى إلى المستوى الرابع'],
  [5, 'قرية كبرى', 'village', 110, 'development_center', 'gold:1200, wood:550, stone:400, iron:100', 5, 'palisade', 'آخر مستويات العصر الخشبي'],
  [6, 'بلدة', 'town', 150, SEED_STAGE_UPGRADE.town[0], SEED_STAGE_UPGRADE.town[1], 6, 'stone', 'العصر الحجري: مبانٍ حجرية وسور حجري'],
  [7, 'مدينة', 'city', 600, SEED_STAGE_UPGRADE.city[0], SEED_STAGE_UPGRADE.city[1], 7, 'stone', 'المدينة: الحكومة والصناعة والميناء'],
];

/**
 * حصة التوسع لكل مستوى حكم: مجموع قطع الغابة 3 × 3 المسموح بقطعها حتى بلوغه — 16 في المستويات 1–3، ثم 4 قطع لكل مستوى بعدها
 * The expansion quota per government level: the total 3 × 3 forest parcels clearable by then — 16 in levels 1–3, then 4 per level after
 */
const SEED_EXPANSION_PARCELS = { 1: 16, 2: 16, 3: 16, 4: 20, 5: 24, 6: 28, 7: 32 };

/**
 * مستويات المباني: [المستوى، مضاعف الإنتاج، مضاعف السكان والعمال، نسبة تكلفة الترقية من تكلفة البناء، نسبة مدتها من مدة البناء، الطراز]
 * Building levels: [level, output factor, residents and workers factor, upgrade cost as % of the build cost, its time as % of the build time, look]
 */
const SEED_BUILDING_LEVELS = [
  [1, 1, 1, 0, 0, 'wood'], [2, 1.4, 1.25, 100, 100, 'wood'], [3, 1.8, 1.5, 150, 120, 'wood'], [4, 2.3, 1.75, 200, 140, 'wood'],
  [5, 2.8, 2, 250, 160, 'wood'], [6, 3.6, 2.5, 300, 200, 'stone'], [7, 4.5, 3, 400, 250, 'stone'],
];

/** المباني القائمة مع بداية اللعبة حول مبنى الحكم: مصدر الماء والمنشآت الخمس ومساكن عمالها (والعامل يدير البئر) / The buildings standing at the start (a laborer runs the well) */
const SEED_START_BUILDINGS = [
  'well', 'houses', 'farm', 'farmers_house', 'lumber_camp', 'sawmill', 'carpenters_house', 'blacksmith', 'smiths_house', 'stone_prospector', 'miners_house',
];

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
  // الأرض الخصبة لا يولّدها العالم، بل تكشفها قطع الغابة فقط / Fertile land is never generated; only forest clearing reveals it
  ['fertile_land', 'أرض خصبة', 'food', 'plain', 0, 'food', '#8fbf6a'],
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
  buildingCategories: MENU_ORDER.concat([['security', 'الأمن'], ['military', 'الجيش'], ['science', 'العلوم'], ['agriculture', 'الزراعة'], ['services', 'الخدمات']])
    .map(function (c, i) { return { 'المعرف': c[0], 'الاسم': c[1], 'الترتيب': i + 1 }; }),
  buildings: SEED_BUILDINGS.map(function (b, i) {
    return {
      'المعرف': b[0], 'الاسم': b[1], 'الفئة': menuCategory_(b[0], b[2]), 'التضاريس المسموحة': b[3], 'مدة البناء بالثواني': b[4], 'التقنية المطلوبة': b[5],
      'الترتيب': i + 1, 'المرحلة المطلوبة': b[6], 'السكان المضافون': b[7], 'النموذج': b[8], 'يتطلب طريق': b[9], 'يتطلب مكمن': b[10] || '',
      'المهنة': (SEED_JOBS[b[0]] || [''])[0], 'عدد العمال': (SEED_JOBS[b[0]] || ['', 0])[1],
      'السكان المطلوبون': (SEED_JOBS[b[0]] || ['', 0, 0])[2], 'المباني المطلوبة': (SEED_JOBS[b[0]] || ['', 0, 0, ''])[3],
      'منطقة الاقتراح': SEED_ZONES[b[0]] || '',
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
  ].concat(SEED_RESOURCE_COSTS, SEED_DEPOSIT_COSTS, SEED_PRIMITIVE_COSTS, SEED_ECONOMY_COSTS, SEED_MENU_COSTS)),
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
    ['village', 'قرية', 0, FOREST_FRONTIER.stageRadius.village, PRIMITIVE_ERA.villageDescription],
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
  governmentLevels: SEED_GOVERNMENT_LEVELS.map(function (l) {
    return {
      'المستوى': l[0], 'الاسم': l[1], 'المرحلة': l[2], 'السكان المطلوبون': l[3], 'المباني المطلوبة': l[4], 'تكلفة الترقية': l[5],
      'أقصى مستوى للمباني': l[6], 'طراز السور': l[7], 'الوصف': l[8], 'قطع التوسع': SEED_EXPANSION_PARCELS[l[0]],
    };
  }),
  buildingLevels: SEED_BUILDING_LEVELS.map(function (l) {
    return { 'المستوى': l[0], 'مضاعف الإنتاج': l[1], 'مضاعف السكان': l[2], 'نسبة تكلفة الترقية': l[3], 'نسبة مدة الترقية': l[4], 'الطراز': l[5] };
  }),
  startBuildings: SEED_START_BUILDINGS.map(function (id, i) { return { 'معرف المبنى': id, 'الترتيب': i + 1 }; }),
  frontierResources: SEED_FRONTIER_RESOURCES.map(function (r) {
    return { 'معرف نوع المكمن': r[0], 'الاحتمال': r[1], 'أدنى مستوى للحكم': r[2], 'أدنى غنى': r[3], 'أعلى غنى': r[4] };
  }),
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
    cmds_('empty_tile', [['build', 'بناء', 'build'], ['annex', 'قطع الغابة', 'wood'], ['road', 'طريق', 'road'], ['survey', 'مسح الموارد', 'lab'], ['info', 'معلومات', 'info']]),
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
