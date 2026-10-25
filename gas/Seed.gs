// مسؤولية الملف: البيانات الأولية للعبة — تُكتب في الجداول الفارغة أو الناقصة فقط، وبعدها يُعدَّل كل شيء من الشيت
// File responsibility: initial game data — written only into empty or incomplete tables; afterwards everything is edited in the sheet

/** قيم إعدادات العالم الأولية حسب الحقل / Initial world settings by field */
const SEED_WORLD = {
  seed: 1447,
  tilesX: 64,
  tilesZ: 64,
  tileSize: 4,
  vertsPerTile: 3,
  seaLevel: 0.42,
  heightScale: 20,
  depthScale: 12,
  noiseScale: 0.07,
  moistureScale: 0.045,
  islandFalloff: 0.32,
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
};

/**
 * المباني: [المعرف، الاسم، الفئة، التضاريس، المدة بالثواني، التقنية، المرحلة، السكان المضافون، النموذج، يتطلب طريق]
 * أول 12 مبنى من الإعداد الأول بنفس ترتيبها، والبقية من إضافة تطور القرية
 * Buildings: the first 12 come from the first setup in the same order; the rest from the village progression addition
 */
const SEED_BUILDINGS = [
  ['farm', 'مزرعة', 'economy', 'plain', 20, '', 'village', 0, 'field', false],
  ['lumber_camp', 'معسكر حطابين', 'economy', 'plain', 25, '', 'village', 0, 'industry', false],
  ['mine', 'منجم', 'economy', 'mountain, plateau', 45, '', 'town', 0, 'industry', false],
  ['oil_field', 'حقل نفط', 'economy', 'desert', 90, '', 'city', 0, 'industry', false],
  ['houses', 'مساكن', 'housing', 'plain, coast, plateau', 30, '', 'village', 12, 'house', true],
  ['road', 'طريق', 'transport', 'coast, plain, desert, plateau, mountain', 5, '', 'village', 0, 'road', false],
  ['port', 'ميناء', 'transport', 'coast', 180, '', 'city', 0, 'industry', true],
  ['airport', 'مطار', 'transport', 'plain, desert', 300, 'aviation', 'city', 0, 'civic', true],
  ['police', 'مركز شرطة', 'security', 'plain, coast, desert, plateau', 60, '', 'town', 0, 'civic', true],
  ['barracks', 'ثكنة', 'military', 'plain, desert, plateau', 90, '', 'city', 0, 'civic', true],
  ['school', 'مدرسة', 'science', 'plain, coast, plateau', 60, '', 'town', 0, 'civic', true],
  ['research_center', 'مركز أبحاث', 'science', 'plain, coast', 240, 'science_1', 'city', 0, 'civic', true],
  ['water_desal', 'محطة تحلية', 'utilities', 'coast', 60, '', 'village', 0, 'utility', false],
  ['power_plant', 'محطة كهرباء', 'utilities', 'plain, desert, coast, plateau', 90, '', 'village', 0, 'utility', false],
  ['apartments', 'مبانٍ سكنية', 'housing', 'plain, coast, plateau', 60, '', 'village', 40, 'tower', true],
  ['livestock', 'حظيرة مواشي', 'agriculture', 'plain, plateau', 40, '', 'village', 0, 'barn', false],
  ['market', 'سوق', 'economy', 'plain, coast', 50, '', 'village', 0, 'civic', true],
  ['civil_defense', 'دفاع مدني', 'security', 'plain, coast, desert, plateau', 70, '', 'town', 0, 'civic', true],
  ['hospital', 'مستشفى', 'services', 'plain, coast, plateau', 120, '', 'town', 0, 'civic', true],
  ['paved_road', 'طريق معبد', 'transport', 'coast, plain, desert, plateau, mountain', 10, '', 'town', 0, 'paved-road', false],
  ['park', 'حديقة', 'services', 'plain, coast, plateau', 30, '', 'town', 0, 'park', false],
  ['village_center', 'مركز القرية', 'government', 'plain, coast, plateau', 150, '', 'town', 0, 'civic', true],
  ['governor_palace', 'قصر الحاكم', 'government', 'plain, coast, plateau', 300, '', 'city', 0, 'palace', true],
  ['finance_center', 'مركز المالية', 'government', 'plain, coast, plateau', 200, '', 'city', 0, 'tower', true],
  ['factory', 'مصنع', 'industry', 'plain, desert, plateau', 180, '', 'city', 0, 'industry', true],
  ['train_station', 'محطة قطار', 'transport', 'plain, desert, plateau', 240, '', 'city', 0, 'civic', true],
  ['military_base', 'قاعدة عسكرية', 'military', 'plain, desert, plateau', 240, '', 'city', 0, 'civic', true],
  ['development_center', 'مركز تطوير القرية', 'government', 'plain, coast, plateau', 90, '', 'village', 0, 'civic', true],
  ['military_command', 'مركز القيادة العسكرية', 'military', 'plain, desert, plateau', 180, '', 'town', 0, 'civic', true],
];

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
  ].map(function (r, i) { return { 'المعرف': r[0], 'الاسم': r[1], 'الأيقونة': r[2], 'اللون': r[3], 'الكمية الابتدائية': r[4], 'الترتيب': i + 1 }; }),
  buildingCategories: [
    ['economy', 'الاقتصاد'], ['housing', 'الإسكان'], ['transport', 'النقل'], ['security', 'الأمن'], ['military', 'الجيش'], ['science', 'العلوم'],
    ['utilities', 'المرافق'], ['agriculture', 'الزراعة'], ['services', 'الخدمات'], ['government', 'الحكومة'], ['industry', 'الصناعة'],
  ].map(function (c, i) { return { 'المعرف': c[0], 'الاسم': c[1], 'الترتيب': i + 1 }; }),
  buildings: SEED_BUILDINGS.map(function (b, i) {
    return {
      'المعرف': b[0], 'الاسم': b[1], 'الفئة': b[2], 'التضاريس المسموحة': b[3], 'مدة البناء بالثواني': b[4], 'التقنية المطلوبة': b[5],
      'الترتيب': i + 1, 'المرحلة المطلوبة': b[6], 'السكان المضافون': b[7], 'النموذج': b[8], 'يتطلب طريق': b[9],
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
  ]),
  buildingProduction: amounts_('الكمية في الدقيقة', [
    ['farm', 'food', 30], ['lumber_camp', 'wood', 24], ['mine', 'stone', 18], ['mine', 'iron', 8], ['oil_field', 'oil', 6],
    ['port', 'gold', 30], ['port', 'food', 10], ['water_desal', 'water', 25], ['power_plant', 'power', 25],
    ['livestock', 'food', 25], ['market', 'gold', 30], ['finance_center', 'gold', 60], ['factory', 'gold', 70],
  ]),
  buildingConsumption: amounts_('الكمية في الدقيقة', [
    ['houses', 'food', 2], ['houses', 'water', 1], ['apartments', 'water', 3], ['apartments', 'power', 3], ['apartments', 'food', 4],
    ['livestock', 'water', 2], ['market', 'food', 8], ['civil_defense', 'power', 1], ['hospital', 'water', 2], ['hospital', 'power', 3],
    ['park', 'water', 1], ['finance_center', 'power', 3], ['factory', 'power', 6], ['factory', 'iron', 2],
  ]),
  stages: [
    ['village', 'قرية', 0, 3, 'بداية الدولة: المنازل والطرق والماء والكهرباء والزراعة والسوق'],
    ['town', 'بلدة', 150, 5, 'الخدمات العامة والأمن وتطوير الطرق ومركز القرية'],
    ['city', 'مدينة', 600, 8, 'الحكومة والصناعة والميناء والمطار والقطار والقواعد العسكرية'],
  ].map(function (s, i) {
    return { 'المعرف': s[0], 'الاسم': s[1], 'الترتيب': i + 1, 'السكان المطلوبون': s[2], 'نصف قطر الحدود': s[3], 'الوصف': s[4] };
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
