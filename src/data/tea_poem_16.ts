export interface TeaChapter {
  chapterIndex: number; // 1 to 16
  title: string;
  leftColumn: string[];
  rightColumn: string[];
  rhymeWordLeft: string;
  rhymeWordRight: string;
  historicalTheme: string;
}

export const TEA_POEM_PREFACE = `茶者，人在草木间也。拆其字：草头为双十，人木为八十有八，合一百零八之数，故称茶寿。上合天罡三十六，下应地煞七十二。一叶至微，暗合天地之数；是以华夏以茶为精神，炎黄以茶为图腾。

昔人论华夷之辨，约有三端：血缘、地缘、冠服。千禧以降，混血之家日众，跨海而居者日多，洋装而裹中国心者比比皆是。以余观之，华夷之隔，不过一茶耳——认这片叶子者，皆是故人。

唐有陆羽著《茶经》，千年之距；东瀛有冈仓天心著《茶书》，烟海之隔。东坡居士尝以一百二十句长诗《寄周安孺茶》，写尽人与茶之缘。余乃不揣浅陋，以五绝为体，以茶史为经，一韵到底，双栏对位，成十六章、二百五十六句、凡一千二百八十字，名曰《茶史五绝赋》。`;

export const TEA_POEM_16_CHAPTERS: TeaChapter[] = [
  {
    chapterIndex: 1,
    title: '第一章 · 滇南茶源',
    historicalTheme: '草木源头 · 上古祭祀与茶树原乡',
    leftColumn: ['傣王故郡府，云南新茶都。', '怀寮引缅越，接藏连黔蜀。', '勐海属南国，丘园生嘉木。', '昆明永恒春，光明撩云雾。'],
    rightColumn: ['星分柳鬼域，朱雀彩云出。', '白虎啸南天，罗睺双目怒。', '荒蛮祝融虐，巫舞雩祭处。', '三诵供云咒，久旱甘霖赴。'],
    rhymeWordLeft: '都 / 蜀 / 木 / 雾',
    rhymeWordRight: '出 / 怒 / 处 / 赴'
  },
  {
    chapterIndex: 2,
    title: '第二章 · 三国茶事',
    historicalTheme: '群雄割据 · 武侯祛瘴与三国茶影',
    leftColumn: ['孔明为祛瘴，采茶涉险途。', '功盖三分国，于今谓茶祖。', '魏武观沧海，洛神腰约素。', '文姬抚焦尾，曲误周郎顾。'],
    rightColumn: ['白茶不杀青，遗恨失吞吴。', '绿茶傲江东，碧海出珊瑚。', '黑茶金花散，繁星应天斛。', '三国如三茶，细品回甘驻。'],
    rhymeWordLeft: '途 / 祖 / 素 / 顾',
    rhymeWordRight: '吴 / 瑚 / 斛 / 驻'
  },
  {
    chapterIndex: 3,
    title: '第三章 · 魏晋风度',
    historicalTheme: '竹林玄远 · 广陵绝唱与清谈避乱',
    leftColumn: ['绝唱梁甫吟，天下入晋彀。', '八王乱朝纲，七贤竹林怵。', '不第建安品，性贵自珍沽。', '玄学风乍起，清谈避党锢。'],
    rightColumn: ['可怜广陵散，戎机无心赴。', '不知有汉存，遑论魏晋毋。', '采菊东篱下，花茶若五胡。', '玉玺非国本，诸侯趋若鹜。'],
    rhymeWordLeft: '彀 / 怵 / 沽 / 锢',
    rhymeWordRight: '赴 / 毋 / 胡 / 鹜'
  },
  {
    chapterIndex: 4,
    title: '第四章 · 南朝烟雨',
    historicalTheme: '衣冠南渡 · 采茶罗敷与烟火巷陌',
    leftColumn: ['孔雀东南飞，衣冠皆南渡。', '茗草生芳泽，幽兰谁家姝。', '窈窕采茶女，持盅名罗敷。', '生民曰大德，嗟我为茶妇。'],
    rightColumn: ['日毒祈龙嚏，沐我茶稷黍。', '鼠壤有余糈，兼味并时蔬。', '贫贱志益坚，青云排鸿鹄。', '王谢茶堂燕，寻常巷陌入。'],
    rhymeWordLeft: '渡 / 姝 / 敷 / 妇',
    rhymeWordRight: '黍 / 蔬 / 鹄 / 入'
  },
  {
    chapterIndex: 5,
    title: '第五章 · 隋唐禅茶',
    historicalTheme: '一苇渡江 · 达摩禅境与滕王落霞',
    leftColumn: ['四百八十寺，达摩曰功无。', '一苇渡江北，梁武中崩殂。', '魏碑赑屃载，佛像满石窟。', '禅宗兴唐初，慧能奉六祖。'],
    rightColumn: ['禅茶本一味，滕王阁序书。', '天人回旧馆，重霄叠翠出。', '飞阁翔丹地，鹤汀接凫渚。', '秋水共长天，落霞与孤鹜。'],
    rhymeWordLeft: '无 / 殂 / 窟 / 祖',
    rhymeWordRight: '书 / 出 / 渚 / 鹜'
  },
  {
    chapterIndex: 6,
    title: '第六章 · 盛唐茶事',
    historicalTheme: '开元盛景 · 诗仙李白与茶圣陆羽',
    leftColumn: ['琴棋书画江，诗酒花茶湖。', '江湖相忘间，开元盛世幕。', '诗仙李太白，茶圣陆太祝。', '大志戏功名，不拘九品禄。'],
    rightColumn: ['庐山三叠泉，银河泄如瀑。', '若论第一品，谷帘泉眼处。', '忘情山水间，仗剑天涯路。', '盛唐气万千，茶事花锦簇。'],
    rhymeWordLeft: '湖 / 幕 / 祝 / 禄',
    rhymeWordRight: '瀑 / 处 / 路 / 簇'
  },
  {
    chapterIndex: 7,
    title: '第七章 · 茶经器用',
    historicalTheme: '五行风炉 · 二十四器与鼎沸三沸',
    leftColumn: ['伊公调羹鼎，陆氏煮茶炉。', '五行去百疾，灭胡明年铸。', '翟者火禽离，飙者风兽巽。', '鱼者水虫坎，风炉形如述。'],
    rightColumn: ['一沸鱼眼布，二沸泉涌珠。', '莫待腾波鼓，水老涩且卤。', '煎茶自唐盛，奢华难再睹。', '茶器二十四，阙一味不复。'],
    rhymeWordLeft: '炉 / 铸 / 巽 / 述',
    rhymeWordRight: '珠 / 卤 / 睹 / 复'
  },
  {
    chapterIndex: 8,
    title: '第八章 · 茶经著述',
    historicalTheme: '七千言著 · 源具造器与吃茶去禅机',
    leftColumn: ['秦王破阵歌，可汗弥汉胡。', '霓裳羽衣曲，盛唐乱节度。', '酒色财气盛，谪仙无茶赋。', '劝君多品茗，莫恋杯中物。'],
    rightColumn: ['茶经七千言，三卷十章著。', '源具造器煮，饮事出略图。', '根柯洒芳津，采服润肌骨。', '唱喝吃茶去，撑船宰相肚。'],
    rhymeWordLeft: '胡 / 度 / 赋 / 物',
    rhymeWordRight: '著 / 图 / 骨 / 肚'
  },
  {
    chapterIndex: 9,
    title: '第九章 · 两宋茶政',
    historicalTheme: '陈桥斧声 · 斗茶西子与岳武穆杯茶',
    leftColumn: ['梁唐晋汉周，柴禅宋太祖。', '陈桥才兵变，烛影又落斧。', '北宋光义后，定都开封府。', '南宋还匡胤，行在临安驻。'],
    rightColumn: ['杯弓蛇影来，风声鹤唳复。', '不思黄河水，甘洒千钟粟。', '龙井一杯祭，怒发凭栏处。', '斗茶西子畔，犹现岳武穆。'],
    rhymeWordLeft: '祖 / 斧 / 府 / 驻',
    rhymeWordRight: '复 / 粟 / 处 / 穆'
  },
  {
    chapterIndex: 10,
    title: '第十章 · 程朱理学',
    historicalTheme: '太极太和 · 格物致知与四书集注',
    leftColumn: ['理学北宋端，五子汗青书。', '康节梅花易，濂溪太极图。', '横渠四句教，二程开新儒。', '大学定四书，曾子立八目。'],
    rightColumn: ['修齐治平道，格致正诚路。', '正心诚意流，格物致知固。', '凝释冰与水，体用物理附。', '谁言堪正宗，添茶看揭幕。'],
    rhymeWordLeft: '书 / 图 / 儒 / 目',
    rhymeWordRight: '路 / 固 / 附 / 幕'
  },
  {
    chapterIndex: 11,
    title: '第十一章 · 鹅湖之会',
    historicalTheme: '心学理学 · 象山朱熹白鹿洞辩义',
    leftColumn: ['九渊陆象山，求理别程朱。', '人同此心禅，心同此理悟。', '初辩心即理，天花坠鹅湖。', '再辩义与利，菩提罩白鹿。'],
    rightColumn: ['心学演绎径，理学归纳路。', '冰融水化炁，遁入空或无。', '无名天地始，有名万物母。', '且看雾升腾，茶会周而复。'],
    rhymeWordLeft: '朱 / 悟 / 湖 / 鹿',
    rhymeWordRight: '路 / 无 / 母 / 复'
  },
  {
    chapterIndex: 12,
    title: '第十二章 · 心学东渡',
    historicalTheme: '扶桑茶道 · 和敬清寂与包公惊堂',
    leftColumn: ['文公享孔庙，存斋远江湖。', '心学魄已散，茶道扶桑渡。', '和敬与清寂，一念一浮屠。', '抱朴并守拙，一期一会晤。'],
    rightColumn: ['神游镰仓幕，魂回开封府。', '出定朦胧看，打坐包龙图。', '铁面秉直断，月光穿迷雾。', '三口铡刀立，忽拍惊堂木。'],
    rhymeWordLeft: '湖 / 渡 / 屠 / 晤',
    rhymeWordRight: '府 / 图 / 雾 / 木'
  },
  {
    chapterIndex: 13,
    title: '第十三章 · 大理南诏',
    historicalTheme: '茶马古道 · 密印汉梵与雪山商贾',
    leftColumn: ['夜郎楚西南，爨氏汉晋度。', '有唐封南诏，至宋开八府。', '段氏主大理，治国依释儒。', '滇密传阿吒，密印汉梵图。'],
    rightColumn: ['文脉骨肉连，地缘相依附。', '战略同进退，茶马贸易互。', '冰期如约至，铁骑出蒙古。', '国祚叁佰载，赵宋已落幕。'],
    rhymeWordLeft: '度 / 府 / 儒 / 图',
    rhymeWordRight: '附 / 互 / 古 / 幕'
  },
  {
    chapterIndex: 14,
    title: '第十四章 · 元明易代',
    historicalTheme: '鼎革换朝 · 普洱解腻与太祖烧饼',
    leftColumn: ['世祖忽必烈，蒙元定大都。', '天子手把肉，庙堂无筷箸。', '普洱解油腻，茶风陋且粗。', '胡虏无百年，冥冥有定数。'],
    rightColumn: ['草根逆袭帝，重八明太祖。', '一缺金龙咬，烧饼茶盅覆。', '鞑靼尚功利，牛饮只为肚。', '唐宋过奢华，鼎革易章服。'],
    rhymeWordLeft: '都 / 箸 / 粗 / 数',
    rhymeWordRight: '祖 / 覆 / 肚 / 服'
  },
  {
    chapterIndex: 15,
    title: '第十五章 · 明代茶事',
    historicalTheme: '紫砂功夫 · 散茶返璞与宣德香炉',
    leftColumn: ['龙团凤饼罢，散茶见工夫。', '大浪淘金沙，宜兴紫砂壶。', '稻黍稷麦菽，人皆难免俗。', '牙佳方为雅，饭后茶水漱。'],
    rightColumn: ['茶有真天香，龙麝未可估。', '对坐茶室中，焚香宣德炉。', '茶汤过五脏，茗香安六腑。', '必正精气神，一扫劳与碌。'],
    rhymeWordLeft: '夫 / 壶 / 俗 / 漱',
    rhymeWordRight: '估 / 炉 / 腑 / 碌'
  },
  {
    chapterIndex: 16,
    title: '第十六章 · 华夏茶魂',
    historicalTheme: '河图洛书 · 繁花过眼与万古流觞',
    leftColumn: ['伏羲演八卦，龙马驮河图。', '大禹分九州，玄龟负洛书。', '神农尝百草，灵芽愈百毒。', '炎黄战蚩尤，华夏定涿鹿。'],
    rightColumn: ['繁花过眼尽，乡恋一抔土。', '落叶终寻根，洪洞大槐树。', '上下五千载，逝者如斯夫。', '兰亭感流觞，澄怀为君赋。'],
    rhymeWordLeft: '图 / 书 / 毒 / 鹿',
    rhymeWordRight: '土 / 树 / 夫 / 赋'
  }
];
