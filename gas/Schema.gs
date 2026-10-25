// مسؤولية الملف: وصف كل جداول قاعدة البيانات وأعمدتها، وربط كل عمود عربي بحقل في بيانات اللعبة
// File responsibility: describes every database table and column, mapping each Arabic column to a game field
//
// أنواع الأعمدة / Column types:
//   string نص، number رقم (يقبل الأرقام العربية والإنجليزية)، boolean مربع اختيار، list قائمة مفصولة بفاصلة
//
// لإضافة جدول أو عمود جديد مستقبلًا: أضفه هنا، ثم أنشئ دالة إضافة مستقلة في ملف Migration_*.gs
// تضيف هذه الإضافة وحدها (مثل addEconomyTables). كل الإضافات تضيف فقط ولا تحذف ولا تعدّل شيئًا.
// To add a table or column later: add it here, then create a dedicated Migration_*.gs function that adds
// only that change (e.g. addEconomyTables). Every addition is additive and never deletes or edits data.

/**
 * عمود مشترك لإيقاف صف بدل حذفه؛ غير المؤشَّر يعني أن الصف يعمل
 * Shared column to disable a row instead of deleting it; unchecked means the row is in use
 */
const DISABLED_COLUMN = { name: 'موقوف', field: 'disabled', type: 'boolean' };

/** جدول إعدادات العالم: صف لكل إعداد (المفتاح والقيمة والوصف) / World settings: one row per setting */
const WORLD_SETTINGS = [
  { key: 'بذرة العالم', field: 'seed', type: 'number', description: 'رقم يحدد شكل العالم المولَّد؛ نفس الرقم يعطي نفس العالم' },
  { key: 'عدد المربعات أفقيا', field: 'tilesX', type: 'number', description: 'عرض الخريطة بالمربعات' },
  { key: 'عدد المربعات عموديا', field: 'tilesZ', type: 'number', description: 'عمق الخريطة بالمربعات' },
  { key: 'حجم المربع', field: 'tileSize', type: 'number', description: 'طول ضلع المربع بوحدات العالم' },
  { key: 'دقة التضاريس', field: 'vertsPerTile', type: 'number', description: 'عدد نقاط الارتفاع في ضلع المربع؛ الأعلى أنعم وأثقل' },
  { key: 'مستوى البحر', field: 'seaLevel', type: 'number', description: 'من 0 إلى 1؛ ما تحته ماء' },
  { key: 'أقصى ارتفاع', field: 'heightScale', type: 'number', description: 'ارتفاع أعلى قمة بوحدات العالم' },
  { key: 'أقصى عمق', field: 'depthScale', type: 'number', description: 'عمق أعمق نقطة في البحر' },
  { key: 'كثافة التضاريس', field: 'noiseScale', type: 'number', description: 'الأعلى يعطي تضاريس أكثر تفاصيل وأصغر مساحة' },
  { key: 'كثافة الرطوبة', field: 'moistureScale', type: 'number', description: 'تحدد حجم مناطق الصحراء والسهول' },
  { key: 'انحدار الأطراف', field: 'islandFalloff', type: 'number', description: 'كلما زاد أحاط البحر باليابسة أكثر' },
  { key: 'اسم الدولة', field: 'nationName', type: 'string', description: 'يظهر في شريط الموارد' },
  { key: 'اسم العاصمة', field: 'capitalName', type: 'string', description: 'اسم المدينة الأولى' },
  { key: 'تضاريس العاصمة', field: 'capitalTerrain', type: 'list', description: 'معرفات التضاريس المسموح بناء العاصمة عليها، مفصولة بفاصلة' },
  { key: 'جودة الرسوم', field: 'defaultQuality', type: 'string', description: 'auto أو low أو medium أو high' },
  // إضافة تطور القرية (addVillageProgression) / Village progression addition
  { key: 'عدد المواقع المقترحة', field: 'startSiteCount', type: 'number', description: 'عدد مواقع الانطلاق التي يختار منها اللاعب في بداية اللعبة' },
  { key: 'نمو السكان في الدقيقة', field: 'populationGrowthPerMinute', type: 'number', description: 'عدد السكان الذين ينضمون أو يغادرون كل دقيقة حتى تمتلئ المساكن العاملة' },
  { key: 'عدد البناء المتزامن', field: 'maxConcurrentBuilds', type: 'number', description: 'أقصى عدد مبانٍ تحت الإنشاء في نفس الوقت؛ الطرق لا تُحسب منها' },
  { key: 'نسبة تكلفة النقل', field: 'moveCostPercent', type: 'number', description: 'تكلفة نقل مبنى كنسبة مئوية من تكلفة بنائه' },
  { key: 'نسبة استرداد الهدم', field: 'demolishRefundPercent', type: 'number', description: 'ما يُسترد عند الهدم كنسبة مئوية من تكلفة البناء' },
  { key: 'مدة اليوم بالدقائق', field: 'dayLengthMinutes', type: 'number', description: 'مدة يوم كامل في اللعبة بالدقائق الحقيقية؛ صفر يعني اتباع ساعة الجهاز' },
  { key: 'أقصى ساعات الغياب', field: 'offlineCapHours', type: 'number', description: 'أقصى عدد ساعات يُحسب فيها الإنتاج أثناء غياب اللاعب' },
  { key: 'مورد الضم', field: 'annexResource', type: 'string', description: 'معرف المورد الذي يُدفع لضم مربع للدولة' },
  { key: 'تكلفة ضم المربع', field: 'annexCost', type: 'number', description: 'كمية مورد الضم لكل قطعة أرض جديدة' },
  // إضافة مباني الموارد (addResourceBuildings) / Resource buildings addition
  { key: 'حجم قطعة الضم', field: 'annexBlockSize', type: 'number', description: 'طول ضلع قطعة الأرض التي تُضم دفعة واحدة بعدد المربعات' },
  // إضافة العالم والمكامن (addWorldAndDeposits) / World and deposits addition
  { key: 'نصف قطر المنطقة المسطحة', field: 'flatZoneRadius', type: 'number', description: 'نصف ضلع المنطقة المسطحة حول كل موقع عاصمة مقترح بعدد المربعات' },
  { key: 'عدد السلاسل الجبلية', field: 'massifCount', type: 'number', description: 'عدد السلاسل الجبلية في العالم؛ كل سلسلة فيها معدن واحد' },
  { key: 'نصف قطر السلسلة الجبلية', field: 'massifRadius', type: 'number', description: 'حجم السلسلة الجبلية بعدد المربعات' },
  { key: 'عدد البحيرات', field: 'lakeCount', type: 'number', description: 'عدد البحيرات الداخلية في العالم' },
  { key: 'نصف قطر البحيرة', field: 'lakeRadius', type: 'number', description: 'حجم البحيرة بعدد المربعات' },
  { key: 'نطاق الاكتشاف', field: 'discoveryRadius', type: 'number', description: 'المكامن التي تقع على هذا البعد من حدود الدولة تظهر تلقائيًا' },
  { key: 'نطاق مسح الموارد', field: 'surveyRadius', type: 'number', description: 'نصف قطر المنطقة التي يكشفها أمر مسح الموارد' },
  { key: 'مورد المسح', field: 'surveyResource', type: 'string', description: 'معرف المورد الذي يُدفع لمسح الموارد' },
  { key: 'تكلفة مسح الموارد', field: 'surveyCost', type: 'number', description: 'كمية مورد المسح لكل عملية' },
  { key: 'اسم مبنى الحكم', field: 'governmentName', type: 'string', description: 'اسم أول مبنى في القرية' },
];

/**
 * الجداول. المعرف (id) للاستخدام البرمجي فقط، والاسم (name) هو اسم الورقة العربي
 * Tables. "id" is the code identifier only; "name" is the Arabic sheet name
 */
const TABLES = [
  {
    id: 'world', name: 'إعدادات العالم', kind: 'settings',
    columns: [
      { name: 'المفتاح', field: 'key', type: 'string' },
      { name: 'القيمة', field: 'value', type: 'string' },
      { name: 'الوصف', field: 'description', type: 'string' },
    ],
  },
  {
    id: 'terrain', name: 'التضاريس',
    columns: [
      { name: 'المعرف', field: 'id', type: 'string' },
      { name: 'الاسم', field: 'name', type: 'string' },
      { name: 'اللون', field: 'color', type: 'string' },
      { name: 'الأولوية', field: 'priority', type: 'number' },
      { name: 'أدنى ارتفاع', field: 'minElevation', type: 'number' },
      { name: 'أعلى ارتفاع', field: 'maxElevation', type: 'number' },
      { name: 'أدنى رطوبة', field: 'minMoisture', type: 'number' },
      { name: 'أعلى رطوبة', field: 'maxMoisture', type: 'number' },
      { name: 'مائي', field: 'isWater', type: 'boolean' },
      { name: 'يتطلب مجاورة الماء', field: 'requiresWaterNeighbor', type: 'boolean' },
      DISABLED_COLUMN,
    ],
  },
  {
    id: 'resources', name: 'الموارد',
    columns: [
      { name: 'المعرف', field: 'id', type: 'string' },
      { name: 'الاسم', field: 'name', type: 'string' },
      { name: 'الأيقونة', field: 'icon', type: 'string' },
      { name: 'اللون', field: 'color', type: 'string' },
      { name: 'الكمية الابتدائية', field: 'startAmount', type: 'number' },
      { name: 'الترتيب', field: 'order', type: 'number' },
      DISABLED_COLUMN,
    ],
  },
  {
    id: 'buildingCategories', name: 'فئات المباني',
    columns: [
      { name: 'المعرف', field: 'id', type: 'string' },
      { name: 'الاسم', field: 'name', type: 'string' },
      { name: 'الترتيب', field: 'order', type: 'number' },
      DISABLED_COLUMN,
    ],
  },
  {
    id: 'buildings', name: 'المباني',
    columns: [
      { name: 'المعرف', field: 'id', type: 'string' },
      { name: 'الاسم', field: 'name', type: 'string' },
      { name: 'الفئة', field: 'category', type: 'string' },
      { name: 'التضاريس المسموحة', field: 'allowedTerrain', type: 'list' },
      { name: 'مدة البناء بالثواني', field: 'buildSeconds', type: 'number' },
      { name: 'التقنية المطلوبة', field: 'requiresTech', type: 'string' },
      { name: 'الترتيب', field: 'order', type: 'number' },
      DISABLED_COLUMN,
      // إضافة تطور القرية / Village progression addition
      { name: 'المرحلة المطلوبة', field: 'stage', type: 'string' },
      { name: 'السكان المضافون', field: 'housing', type: 'number' },
      { name: 'النموذج', field: 'model', type: 'string' },
      { name: 'يتطلب طريق', field: 'requiresRoad', type: 'boolean' },
      // إضافة العالم والمكامن / World and deposits addition
      { name: 'يتطلب مكمن', field: 'requiresDeposit', type: 'string' },
    ],
  },
  {
    id: 'depositTypes', name: 'أنواع المكامن',
    columns: [
      { name: 'المعرف', field: 'id', type: 'string' },
      { name: 'الاسم', field: 'name', type: 'string' },
      { name: 'معرف المورد', field: 'resourceId', type: 'string' },
      { name: 'المكان', field: 'place', type: 'string' },
      { name: 'العدد في العالم', field: 'count', type: 'number' },
      { name: 'الأيقونة', field: 'icon', type: 'string' },
      { name: 'اللون', field: 'color', type: 'string' },
      DISABLED_COLUMN,
    ],
  },
  {
    id: 'stages', name: 'مراحل التطور',
    columns: [
      { name: 'المعرف', field: 'id', type: 'string' },
      { name: 'الاسم', field: 'name', type: 'string' },
      { name: 'الترتيب', field: 'order', type: 'number' },
      { name: 'السكان المطلوبون', field: 'population', type: 'number' },
      { name: 'نصف قطر الحدود', field: 'territoryRadius', type: 'number' },
      { name: 'الوصف', field: 'description', type: 'string' },
      DISABLED_COLUMN,
    ],
  },
  {
    id: 'buildingConsumption', name: 'استهلاك المباني',
    columns: [
      { name: 'معرف المبنى', field: 'buildingId', type: 'string' },
      { name: 'معرف المورد', field: 'resourceId', type: 'string' },
      { name: 'الكمية في الدقيقة', field: 'perMinute', type: 'number' },
      DISABLED_COLUMN,
    ],
  },
  {
    id: 'buildingCosts', name: 'تكاليف المباني',
    columns: [
      { name: 'معرف المبنى', field: 'buildingId', type: 'string' },
      { name: 'معرف المورد', field: 'resourceId', type: 'string' },
      { name: 'الكمية', field: 'amount', type: 'number' },
      DISABLED_COLUMN,
    ],
  },
  {
    id: 'buildingProduction', name: 'إنتاج المباني',
    columns: [
      { name: 'معرف المبنى', field: 'buildingId', type: 'string' },
      { name: 'معرف المورد', field: 'resourceId', type: 'string' },
      { name: 'الكمية في الدقيقة', field: 'perMinute', type: 'number' },
      DISABLED_COLUMN,
    ],
  },
  {
    id: 'ministries', name: 'الوزارات',
    columns: [
      { name: 'المعرف', field: 'id', type: 'string' },
      { name: 'الاسم', field: 'name', type: 'string' },
      { name: 'الوصف', field: 'description', type: 'string' },
      { name: 'الترتيب', field: 'order', type: 'number' },
      DISABLED_COLUMN,
    ],
  },
  {
    id: 'contextCommands', name: 'أوامر القوائم',
    columns: [
      { name: 'نوع العنصر', field: 'entityType', type: 'string' },
      { name: 'المعرف', field: 'id', type: 'string' },
      { name: 'الاسم', field: 'name', type: 'string' },
      { name: 'الأيقونة', field: 'icon', type: 'string' },
      { name: 'الترتيب', field: 'order', type: 'number' },
      DISABLED_COLUMN,
    ],
  },
];

/** البحث عن جدول بمعرفه أو باسم ورقته / Find a table by id or sheet name */
function tableById_(id) {
  return TABLES.find(function (t) { return t.id === id; }) || null;
}
function tableBySheetName_(name) {
  return TABLES.find(function (t) { return t.name === name; }) || null;
}
