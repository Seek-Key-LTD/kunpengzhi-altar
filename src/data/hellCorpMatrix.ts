// 阴司重工央企矩阵 · 纯数据
//
// 把晚清洋务运动与现代央企重工谱系直接打包送进六道轮回。
// 核心落点："现代资本比妖魔鬼怪更没有温度。"

export interface HellCorp {
  /** 代号（00行 / 01局 …） */
  code: string;
  /** 机构全称 */
  name: string;
  /** 核心主业 */
  business: string;
  /** 厂规 / 核心 Slogan */
  slogan: string;
}

export const HELL_CORP_MATRIX: readonly HellCorp[] = [
  {
    code: '00行',
    name: '中国天地银行总行 (BHE)',
    business: '冥界正国级中央金融机构，统掌两界铸币权、功德汇兑与基建专项国债',
    slogan: '天地同币，死生一账；前世因果，通通做质押。'
  },
  {
    code: '01局',
    name: '轮回招商局集团 (CRMG)',
    business: '招魂船日常运营、客流组织、六道航线特许经营开发',
    slogan: '安全转世三千万年，零出轨、零逃票；宁停三分，不抢一秒投胎。'
  },
  {
    code: '02局',
    name: '轮回磁轨建设总局',
    business: '48 米同心双环 NdFeB 永磁导轨铺设、磁通钉扎与阴间基建',
    slogan: '只挖磁槽，不管生死；轨道常在，轮回归一。'
  },
  {
    code: '03所',
    name: '幽冥牵引供电段',
    business: '直线电机地下暗槽敷设、长定子变频逆变、"东风·破业"地轨',
    slogan: '凡插电处，深埋九泉；地面之上，不见凡尘一电。'
  },
  {
    code: '04厂',
    name: '广寒极低温制冷重工',
    business: '九幽深井地底玄冰管道、YBCO 块材深冷与 77K 液氮冷链',
    slogan: '绝对零度见真性，绝对真空无因果——零下196度，锁死一切妄念。'
  },
  {
    code: '05舶',
    name: '招魂船舶工业总公司',
    business: '48 米碳素大天环旗舰总装、75% 虚空透光与柯本吉他原装悬挂',
    slogan: '承载万卷茶经，浮于三寸虚空；船首柯本原声，船尾忘忧挂点。'
  },
  {
    code: '06港',
    name: '黄泉港务有限公司',
    business: '奈何桥泊位调度、醧忘台冷链装卸与彼岸接驳物流',
    slogan: '渡尽前尘客，不留隔夜魂；客满即发，过桥莫回头。'
  },
  {
    code: '07重',
    name: '忘忧重工集团',
    business: '北坡变质量水梯阿特伍德振子、Duffing 三次渐硬神簧制造',
    slogan: '天车拉你有多狠，孟婆接你有多稳；每一次下坠，都是蓄能。'
  },
  {
    code: '08精',
    name: '孟婆精工股份有限公司',
    business: '五味忘忧汤精密分流节流阀、微量喷射灌装与突触记忆清零设备',
    slogan: '五味均匀，一滴不漏；纳米分流，前尘尽洗。'
  },
  {
    code: '09院',
    name: '秘钥先进材料研究院',
    business: '碳基中空大力马骨髓索、管索合一脐带与特氟龙驻极体研制',
    slogan: '管索合一，骨髓相通；别家断绳保你重开，秘钥神索直达无极。'
  },
  {
    code: '10保',
    name: '六道保险股份有限公司',
    business: '独家承保超导脱轨、孟婆汤泄漏、错投畜生道及突触记忆苏醒风险',
    slogan: '生有定数，死有理赔；投错即赔，包赔来世。'
  }
];

/** 至尊冠名（不是央企，是联名） */
export const HELL_SPONSOR = {
  code: '至尊冠名',
  name: 'MTV Unplugged × Kurt Cobain',
  guitar: '1959 Martin D-18E',
  year: 1993,
  slogan: '凡插电者，皆受制于电闸；唯不插电，方可与九幽同频。'
} as const;

/** 联名鞋（忘忧重工 × Air Jordan） */
export const HELL_SNEAKER = {
  brand: '忘忧重工 × Air Jordan',
  model: 'AFTERLIFE BOUNCE「奈何桥限定」',
  colorway: '忘川浊黄 + 碳素暗灰 + 奈何朱砂',
  slogan: '弹得起来，是科技；弹不起来，是轮回。'
} as const;
