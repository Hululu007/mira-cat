import req from '../../util/req.js';

// HoHoJ (py_hohoj) — 暂名，取站方品牌 HoHoJ（好好J）
// 站点: https://hohoj.tv (自建站，非 MacCMS)，姊妹 CDN 为 ggjav.com。
// 2026-10-20 实测结构:
//   列表卡片 (全站统一 24 条/页):
//     <div class="video-item ..."><a href="/video?id={id}">
//       <img src="https://cdn-1.ggjav.com/media/video/small_{文件号}.jpg">
//       <div class="video-item-title">{标题}</div>
//       <div class="video-item-rating"> 眼睛图标 <span class="me-2">{播放量}</span> ...
//     分页统一为查询参数 p={n}；总页数取页面里 changePage(N) 的最大值。
//     URL 里的 name 参数只是装饰，不带也能打开 (已实测)。
//   分类 (全部实测真实存在):
//     固定区: /search?type={all,censored,uncensored,chinese,europe}&order={latest,popular,views,likes}
//     主分类: /main_ctg?id=1..12 (2026-11-13 再探: 13..20 均为 500, 只有 12 个)
//     子标签: /ctg?id={tag} (2026-11-13 全量清点 569 个, id 1..571 42 号空位; 站内无标签索引页)
//     女優:   /model?id={} (首页精选 12 位; 全站索引 /all_models 共 9478 位, 未全量收录)
//   2026-11-13 改版: 子标签不再平铺为顶级分类, 改走顶级分类 + 筛选卡片 (123AV 同款 filters);
//     頂級分類 = 6 固定区 + 無碼流出(标签 101)/屁股(标签 55, 插在熱門后, 站内字面存在) + 12 主分类 + 12 女優;
//     標籤筛选卡片挂在除女優外的全部顶级分类上, 含 569 个真标签。
//   播放 (2026-11-13 再测 10 部全覆盖): 站方只有单档 720p (1280x720, H.264+AAC, 码率约 1.1Mbps),
//     1080p/4K 只是标签名, master.m3u8 也只有一条 1280x720 变体; 集名直接标 720p, 不编造档位。
//   搜索: /search?text={关键词}&p={n}
//   详情: /video?id={} — h5 为标题，播放器区有 large_ 大封面，
//         女優 /model 链接、日期、播放量齐全；无简介文本，内容用标题代。
//   播放 (一步直取): 详情页 iframe 为 /embed?id={}，embed 页 <video src> 与
//         var videoSrc 直接写明 m3u8 (https://video-{n}.ggjav.com/video_1/{文件}.mp4/index.m3u8)。
//         play() 只请求这一个 embed 页即可拿到直链 parse:0 返回。
//         实测播放列表与分片在不带任何自定义头时均 200（分片 TS 魔数 47）；
//         个别文件名带空格（多为 FC2），返回前把空格编码为 %20。
//   VIP: 全站无登录、无付费标记，抽查有码/无码/中字幕/欧美/FC2 均匿名取流成功，无 VIP 锁定。
//   封面: cdn-1.ggjav.com 直链 (站方自有 CDN)。注: 本机 VM 出口直连该 CDN 被重置，
//         已借第三方出口验证图片真实存在并可正常下发；真机若封面不出，
//         可把 ggjav.com 加进 bagua-img-proxy Worker 白名单再改走代理。

const KEY = 'py_hohoj';
const NAME = 'HoHoJ';
const SITE = 'https://hohoj.tv';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const REFERER = SITE + '/';

const SECTIONS = [
  { type_id: 's_latest', type_name: '最新', type: 'all', order: 'latest' },
  { type_id: 's_popular', type_name: '熱門', type: 'all', order: 'popular' },
  { type_id: 's_censored', type_name: '有碼', type: 'censored', order: 'latest' },
  { type_id: 's_uncensored', type_name: '無碼', type: 'uncensored', order: 'latest' },
  { type_id: 's_chinese', type_name: '中文字幕', type: 'chinese', order: 'latest' },
  { type_id: 's_europe', type_name: '歐美', type: 'europe', order: 'latest' },
];

const MAIN_CTG = [
  [1, '絲襪美腿'], [2, '強姦凌辱'], [3, '主奴調教'], [4, '制服誘惑'],
  [5, '多P群交'], [6, '角色劇情'], [7, '出軌'], [8, '亂倫'],
  [9, '巨乳美乳'], [10, '潮吹放尿'], [11, '走後門'], [12, '內射受孕'],
];

// 全站标签 (2026-11-13 全量清点: 569 个, id 1..571, 42 号为空位已剔除; 站内无标签索引页, 均以 /ctg?id= 枚举 + 详情页交叉收割核实)
// 子分类不再平铺为顶级分类, 改走筛选卡片 (见 home() filters); 此表只供筛选卡片与校验用。
const TAGS = [
  [1, 'DMM獨家'],
  [2, '中出'],
  [3, '出軌'],
  [4, '單體作品'],
  [5, '戲劇'],
  [6, '數位馬賽克'],
  [7, '新娘、年輕妻子'],
  [8, '高畫質'],
  [9, '亂倫'],
  [10, '口交'],
  [11, '巨乳'],
  [12, '美少女'],
  [13, '乳交'],
  [14, '戀乳癖'],
  [15, '薄馬賽克'],
  [16, '多P'],
  [17, '潮吹'],
  [18, '人妻'],
  [19, '成熟的女人'],
  [20, '汗だく'],
  [21, '已婚婦女'],
  [22, '內衣'],
  [23, '合集'],
  [24, '女主人、女老板'],
  [25, '温泉'],
  [26, '白人'],
  [27, '姐姐'],
  [28, '凌辱'],
  [29, '花癡'],
  [30, '第一人稱攝影'],
  [31, '自慰'],
  [32, '女優按摩棒'],
  [33, '微乳'],
  [34, '苗條'],
  [35, '讓她懷孕'],
  [36, '貧乳・微乳'],
  [37, '一男對多女'],
  [38, '巨尻'],
  [39, 'OL'],
  [40, '通姦'],
  [41, '不戴胸罩'],
  [43, '秘書'],
  [44, '處男'],
  [45, '其他戀物癖'],
  [46, '打手槍'],
  [47, '深喉'],
  [48, '黑人演員'],
  [49, '妄想族'],
  [50, '娃娃'],
  [51, '換妻'],
  [52, '企畫'],
  [53, '姐妹'],
  [54, '婆婆'],
  [55, '屁股'],
  [56, '戀腿癖'],
  [57, '看護'],
  [58, '故事集'],
  [59, '藥物'],
  [60, '足交'],
  [61, '連褲襪'],
  [62, '情侶'],
  [63, '給女性觀眾'],
  [64, '業餘'],
  [65, '痴女'],
  [66, '蕩婦'],
  [67, '接吻'],
  [68, '偶像藝人'],
  [69, '女教師'],
  [70, '學校泳裝'],
  [71, '母乳'],
  [72, '首次亮相'],
  [73, '淫語'],
  [74, '顏射'],
  [75, '乳房'],
  [76, '千金小姐'],
  [77, '性騷擾'],
  [78, '肛内中出'],
  [79, '輪姦'],
  [80, '大屌 - 粗大的陰莖'],
  [81, '女上位'],
  [82, '女主播'],
  [83, '羞恥'],
  [84, 'M男'],
  [85, '纪录片'],
  [86, '性奴'],
  [87, '高中女生'],
  [88, '母親'],
  [89, '家教'],
  [90, '肌肉'],
  [91, '按摩棒'],
  [92, '女大學生'],
  [93, '處女'],
  [94, '原作合作'],
  [95, '不穿內褲'],
  [96, '拘束'],
  [97, '片刻性高潮'],
  [98, '女生'],
  [99, '打屁股'],
  [100, '無毛'],
  [101, '無碼流出'],
  [102, '兒子'],
  [103, '混血'],
  [104, '亂交'],
  [105, '偶像'],
  [106, 'AV OPEN 2015 狂熱者/戀物部門'],
  [107, '蠻橫嬌羞'],
  [108, '1080p'],
  [109, '哥德蘿莉'],
  [110, '二穴同入'],
  [111, '吞精'],
  [112, '模特'],
  [113, '乳液'],
  [114, '妓女'],
  [115, '美白'],
  [116, '角色扮演'],
  [117, '制服'],
  [118, '精液流出'],
  [119, '69'],
  [120, '舔陰'],
  [121, '首次'],
  [122, '內射'],
  [123, '手淫'],
  [124, '保守'],
  [125, '黑人'],
  [126, '口內射精'],
  [127, '淫亂'],
  [128, '美穴'],
  [129, '美腿'],
  [130, '高'],
  [131, '爆乳'],
  [132, '約會'],
  [133, '搭訕'],
  [134, '日焼け'],
  [135, 'AV OPEN 2015 素人部門'],
  [136, '美人'],
  [137, '公交車'],
  [138, '60fps'],
  [139, 'AV女優'],
  [140, '模特兒'],
  [141, '美臀'],
  [142, '性伴侶'],
  [143, '垂直視頻'],
  [144, '連續內射'],
  [145, 'R-18'],
  [146, '大學生'],
  [147, 'I罩杯'],
  [148, '超乳'],
  [149, 'G罩杯'],
  [150, '孕婦'],
  [151, 'F罩杯'],
  [152, '4小時以上作品'],
  [153, '學校作品'],
  [154, '戀愛'],
  [155, '首次作品'],
  [156, '粗暴'],
  [157, '變性者'],
  [158, '情趣內衣'],
  [159, '女演員最佳集 - 總集篇'],
  [160, '獵豔'],
  [161, '介紹影片'],
  [162, '性感的'],
  [163, '肛交'],
  [164, '女裝人妖'],
  [165, '主觀視角'],
  [166, '玩具'],
  [167, '野外・露出'],
  [168, '粉絲感謝 - 參訪'],
  [169, '濫交'],
  [170, '泡泡浴'],
  [171, '各種職業'],
  [172, '立即口交'],
  [173, '時間停止'],
  [174, '局部特寫'],
  [175, '放尿'],
  [176, '亞洲女演員'],
  [177, '子宮頸'],
  [178, '運動短褲'],
  [179, '女傭'],
  [180, '眼鏡'],
  [181, '4K'],
  [182, '丁字褲'],
  [183, '後背'],
  [184, '胖女人'],
  [185, '蘿莉塔'],
  [186, '妄想'],
  [187, '灌腸'],
  [188, '和服'],
  [189, '和服・喪服'],
  [190, '喪服'],
  [191, '猥褻穿著'],
  [192, '泳裝'],
  [193, '野外'],
  [194, '男の潮吹き'],
  [195, '水手服'],
  [196, '手指插入'],
  [197, '按摩'],
  [198, 'エマニエル'],
  [199, '偷窥'],
  [200, '醫院'],
  [201, '顏面騎乘'],
  [202, '媽媽的朋友'],
  [203, '女同性戀'],
  [204, '女同接吻'],
  [205, '美容院'],
  [206, '體育服'],
  [207, '喝酒派對'],
  [208, 'SM'],
  [209, '監禁'],
  [210, '緊缚'],
  [211, '投稿'],
  [212, '洗澡'],
  [213, 'お風呂'],
  [214, '宅男'],
  [215, '合作作品'],
  [216, '部下・同僚'],
  [217, '爺爺'],
  [218, 'ビッチ'],
  [219, '女上司'],
  [220, '鴨嘴'],
  [221, '迷你裙'],
  [222, '惡作劇'],
  [223, '黑髮'],
  [224, '教師'],
  [225, '老師'],
  [226, '朋友'],
  [227, '不忠'],
  [228, '受虐'],
  [229, 'S級女優'],
  [230, '剃毛'],
  [231, '多毛'],
  [232, '推薦作品'],
  [233, '最佳合集'],
  [234, '痙攣'],
  [235, '美肌'],
  [236, '蘿莉'],
  [237, '同性戀'],
  [238, '潤滑油'],
  [239, '電動按摩器'],
  [240, '戀物癖'],
  [241, '射在外陰'],
  [242, '主婦'],
  [243, '汽車性愛'],
  [244, '大量潮吹'],
  [245, '嬌小'],
  [246, '睡衣'],
  [247, '10代'],
  [248, '內射潮吹'],
  [249, '國外進口'],
  [250, 'DVD多士爐'],
  [251, '陽台'],
  [252, 'D罩杯'],
  [253, '射在衣服上'],
  [254, '寡婦'],
  [255, '嬌小的'],
  [256, '童年朋友'],
  [257, '迷你係列'],
  [258, '幻想'],
  [259, 'M女'],
  [260, '護士'],
  [261, '裸體圍裙'],
  [262, '校服'],
  [263, '養女'],
  [264, '職業裝'],
  [265, '女檢察官'],
  [266, '遊戲的真人版'],
  [267, 'E罩杯'],
  [268, '打飛機'],
  [269, '站立位'],
  [270, '女職員'],
  [271, '新年'],
  [272, '內射觀察'],
  [273, '振動'],
  [274, '亂搞'],
  [275, '兔女郎'],
  [276, '騎乘位'],
  [277, '後入'],
  [278, '指法'],
  [279, '變態'],
  [280, '淋浴'],
  [281, '無套'],
  [282, '白領'],
  [283, '泳衣'],
  [284, 'VIP'],
  [285, '跳舞'],
  [286, '束縛'],
  [287, '騎在臉上'],
  [288, '運動'],
  [289, '特典あり（AVベースボール）'],
  [290, '獨立製作'],
  [291, '飲尿'],
  [292, '尖叫'],
  [293, '項圈'],
  [294, '店員'],
  [295, '跳蛋'],
  [296, 'H罩杯'],
  [297, '催眠'],
  [298, 'DMM專屬'],
  [299, 'VR専用'],
  [300, '高清VR'],
  [301, '折磨'],
  [302, '運動員'],
  [303, '爛醉如泥的'],
  [304, '女戰士'],
  [305, '殘忍畫面'],
  [306, '特效'],
  [307, '紧缚'],
  [308, '魔鏡號'],
  [309, '倒追'],
  [310, '糞便'],
  [311, '及膝襪'],
  [312, '16時間以上作品'],
  [313, '迷你裙警察'],
  [314, '早漏'],
  [315, '性愛'],
  [316, '排便'],
  [317, '女醫生'],
  [318, '身體意識'],
  [319, '叔母'],
  [320, '旅館'],
  [321, '酒店'],
  [322, '設置項目'],
  [323, '福袋'],
  [324, '鼻子勾'],
  [325, '雙性人'],
  [326, '乳溝'],
  [327, '超VIP'],
  [328, '打樁機'],
  [329, '高個子'],
  [330, '浴衣和服'],
  [331, '肛門'],
  [332, '辣妹'],
  [333, '射在屁股'],
  [334, '扯破連褲襪'],
  [335, '空中小姐'],
  [336, '正太控'],
  [337, '講師'],
  [338, '格鬥家'],
  [339, '軟體'],
  [340, '敏感'],
  [341, '學生'],
  [342, '奴役'],
  [343, '小便'],
  [344, '高手'],
  [345, '家中'],
  [346, '長髪'],
  [347, '潤滑劑'],
  [348, '浴室'],
  [349, '旅行'],
  [350, '美容師'],
  [351, 'オナサポ'],
  [352, '3P、4P'],
  [353, '服務生'],
  [354, '前台客服'],
  [355, '限時降價'],
  [356, '暴露'],
  [357, '夫婦'],
  [358, '貓眼'],
  [359, '主動'],
  [360, '反白眼'],
  [361, '緊身衣'],
  [362, '泡泡襪'],
  [363, '插入異物'],
  [364, '課外活動：經理'],
  [365, '賽車女郎'],
  [366, '嘔吐'],
  [367, '假陽具'],
  [368, '面罩'],
  [369, '拳交'],
  [370, '豐滿'],
  [371, '高潮'],
  [372, '教學'],
  [373, '奶奶'],
  [374, 'フルハイビジョン(FHD)'],
  [375, '新娘'],
  [376, 'MGSだけのおまけ映像付き'],
  [377, '緊縛'],
  [378, '明星'],
  [379, '啦啦隊'],
  [380, '黑暗系統'],
  [381, '配信専用'],
  [382, '丈夫'],
  [383, '教室'],
  [384, 'フェラモノ'],
  [385, '偷窺'],
  [386, '巨大陽具'],
  [387, '罵倒'],
  [388, '外觀相似'],
  [389, '貓耳女'],
  [390, '三十路'],
  [391, '女王様'],
  [392, '明星臉'],
  [393, '密會'],
  [394, '睡眠系'],
  [395, '瘙癢'],
  [396, '女僕'],
  [397, '性別轉型·女性化'],
  [398, '連衣裙'],
  [399, '職員'],
  [400, '騎乘內射'],
  [401, '誘惑'],
  [402, '喝口水'],
  [403, '摩擦'],
  [405, '廁所'],
  [406, '強姦'],
  [407, '逆強姦'],
  [408, '巨屌'],
  [409, 'レイプ'],
  [410, 'AV OPEN 2015 企画部門'],
  [411, '吸精'],
  [412, '插兩根'],
  [413, '牢籠'],
  [414, '玩弄肛門'],
  [415, '肛射'],
  [416, '舔耳朵'],
  [417, '電鑽'],
  [418, '陰屁'],
  [419, '陰道觀察'],
  [420, '面具男'],
  [421, '偷拍'],
  [422, '套裝'],
  [423, '圍裙'],
  [424, '第一視角'],
  [425, '放置'],
  [426, '蠟燭'],
  [427, '播音員'],
  [428, '學校'],
  [429, '治癒系'],
  [430, '瑜伽'],
  [431, '打底褲'],
  [432, '側位內射'],
  [433, '後入內射'],
  [434, '灌入精液'],
  [435, '新手'],
  [436, '露出'],
  [437, '車震'],
  [438, '深膚色'],
  [439, '觸手'],
  [440, '動畫'],
  [441, '動畫人物'],
  [442, '翻白眼'],
  [443, '虎牙'],
  [444, '游泳池'],
  [445, '面試'],
  [446, '裸體襪子'],
  [447, '絲襪'],
  [448, 'ローション・オイル'],
  [449, '放尿・失禁'],
  [450, '全裸'],
  [451, '車'],
  [452, '車內'],
  [453, '公園'],
  [454, '網襪'],
  [455, 'AV OPEN 2015 女優部門'],
  [456, '變態遊戲'],
  [457, '伴侶'],
  [458, '科幻'],
  [459, '羞恥・辱め'],
  [460, '大便'],
  [461, '房間'],
  [462, '眼罩'],
  [463, '門口'],
  [464, '女祭司'],
  [465, '女優'],
  [466, '媚薬'],
  [467, '展場女孩'],
  [468, '年輕人妻'],
  [469, '視訊小姐'],
  [470, '出差'],
  [471, '童顔'],
  [472, '小姐'],
  [473, '做家務'],
  [474, '比基尼'],
  [475, '面具'],
  [476, '送貨上門'],
  [477, '眼淚'],
  [478, '小麥色'],
  [479, '調教'],
  [480, '更衣室'],
  [481, '舔腳'],
  [482, '風格出眾'],
  [483, '地下室'],
  [484, '屋頂'],
  [485, '手銬'],
  [486, '體驗懺悔'],
  [487, '超級女英雄'],
  [488, '野球拳'],
  [489, '旗袍'],
  [490, '車掌小姐'],
  [491, '異物插入'],
  [492, '上司'],
  [493, '高清'],
  [494, '下着'],
  [495, '同事'],
  [496, 'AVOPEN2016人妻・熟女部門'],
  [497, '其他'],
  [498, '情人'],
  [499, '新婚'],
  [500, '電話'],
  [501, '鄰居'],
  [502, '極小比基尼'],
  [503, '媽媽'],
  [504, 'AV OPEN 2014 スーパーヘビー'],
  [505, '大陰蒂'],
  [506, '黑幫成員'],
  [507, '舔肛'],
  [508, '舔蛋蛋'],
  [509, '首次內射'],
  [510, '公司'],
  [511, '服侍'],
  [512, '沙發'],
  [513, '辦公室'],
  [514, '願望'],
  [515, '喝酒'],
  [516, '首次肛交'],
  [517, '少女'],
  [518, '着物・浴衣'],
  [519, '鬼混'],
  [520, 'エステ・マッサージ'],
  [521, '陰道擴張'],
  [522, '訪問'],
  [523, '秘密'],
  [524, '榻榻米'],
  [525, '台湾モデル'],
  [526, '3D'],
  [527, 'スチュワーデス・CA'],
  [528, 'パンストモノ'],
  [529, '保健室'],
  [530, '公共廁所'],
  [531, '公主'],
  [532, '淫語モノ'],
  [533, '桌子'],
  [534, '魔法少女'],
  [535, '和室'],
  [536, '農村'],
  [537, '婚禮'],
  [538, '密室'],
  [539, '女忍者'],
  [540, 'AI生成作品'],
  [541, '廚房'],
  [542, '經典'],
  [543, '10枚組'],
  [544, '外遇'],
  [545, '堵嘴·喜劇'],
  [546, '公寓'],
  [547, '字幕'],
  [548, '早洩'],
  [549, '玩具責め'],
  [550, '手マン'],
  [551, '四十路'],
  [552, 'パンチラモノ'],
  [553, '運動系'],
  [554, '複刻版'],
  [555, '白天'],
  [556, '牛仔褲'],
  [557, 'ショートヘアー'],
  [558, '猛烈'],
  [559, '開口器'],
  [560, '射在大腿'],
  [561, '經期'],
  [562, 'HowTo'],
  [563, '風俗'],
  [564, '8KVR'],
  [565, '多人数'],
  [566, '失禁'],
  [567, '醫生'],
  [568, '處女作'],
  [569, '注視'],
  [570, '恐怖'],
  [571, '電梯'],
];
const TAG_IDS = new Set(TAGS.map(([id]) => String(id)));
const TAG_FILTER = TAGS.map(([id, name]) => ({ n: name, v: String(id) }));

// 首页精选女優 (id, 名称)
const MODELS = [
  [404, '素人'], [41, '三上悠亞'], [43, '波多野結衣'], [93, '北野未奈'],
  [990, '凪光'], [44, '篠田優'], [342, 'JULIA'], [586, '河北彩花'],
  [19, '楓可憐'], [1002, '森澤佳奈'], [63, '深田詠美'], [47, '飯岡加奈子'],
];

// 用户点名加在「熱門」后面的两个分类: 站内字面存在 (2026-11-13 实测: 無碼流出=标签 101, 5 页/108 部; 屁股=标签 55, 73 页/1751 部), 不是替代名。
const NEW_TOP_TAGS = [
  [101, '無碼流出'], [55, '屁股'],
];

const CATS = [
  ...SECTIONS.slice(0, 2).map(s => ({ ...s, kind: 'search' })),
  ...NEW_TOP_TAGS.map(([id, name]) => ({ type_id: 't_' + id, type_name: name, kind: 'tag', cid: id })),
  ...SECTIONS.slice(2).map(s => ({ ...s, kind: 'search' })),
  ...MAIN_CTG.map(([id, name]) => ({ type_id: 'c_' + id, type_name: name, kind: 'main', cid: id })),
  ...MODELS.map(([id, name]) => ({ type_id: 'm_' + id, type_name: name, kind: 'model', cid: id })),
];
// 筛选卡片挂在除女優外的全部顶级分类上 (女優页不挂标签筛选)
const FILTER_CATS = CATS.filter(c => c.kind !== 'model');

function t(v) {
  return String(v == null ? '' : v).trim();
}

function clean(s) {
  return t(s).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/\s+/g, ' ');
}

function fixUrl(u) {
  u = t(u);
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('//')) return 'https:' + u;
  return SITE + (u.startsWith('/') ? u : '/' + u);
}

// 带超时的原生 fetch 取文本 (req 兜底通道)
async function timedFetchText(url, headers, timeoutMs) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), timeoutMs || 15000);
  try {
    const r = await fetch(url, { headers, signal: ctl.signal });
    if (!r.ok) return '';
    return await r.text();
  } catch (e) {
    return '';
  } finally {
    clearTimeout(to);
  }
}

// 取页面 HTML: 框架 req 优先，fetch 兜底
async function getHtml(url, timeoutMs) {
  const headers = { 'User-Agent': UA, 'Referer': REFERER, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' };
  const limit = timeoutMs || 15000;
  try {
    const { data, status } = await req.get(url, { headers, timeout: limit });
    if (status === 200 && typeof data === 'string' && data) return data;
  } catch (e) { /* 换 fetch */ }
  return timedFetchText(url, headers, limit);
}

// 解析列表卡片 (列表页/搜索通用)
function parseCards(html) {
  const out = [];
  const seen = new Set();
  // 注意: 必须带尾随空格切分，video-item-title / video-item-rating 是同卡内的子 div，不能误切
  const blocks = html.split('<div class="video-item ');
  for (let i = 1; i < blocks.length; i++) {
    const b = blocks[i];
    const idM = b.match(/href="\/video\?id=(\d+)"/);
    if (!idM) continue;
    const id = idM[1];
    if (seen.has(id)) continue;
    seen.add(id);
    let pic = '';
    const picM = b.match(/<img[^>]+src="(https?:\/\/[^"]+\/media\/video\/[^"]+)"/);
    if (picM) pic = picM[1];
    let title = '';
    const tM = b.match(/video-item-title[^>]*>([^<]+)</);
    if (tM) title = clean(tM[1]);
    if (!title) {
      const altM = b.match(/<img[^>]+alt="([^"]*)"/);
      if (altM) title = clean(altM[1]);
    }
    let remarks = '';
    const vM = b.match(/fa-eye"[^>]*><\/i>\s*<span[^>]*>([^<]+)<\/span>/);
    if (vM) remarks = clean(vM[1]) + ' 播放';
    out.push({ vod_id: id, vod_name: title || id, vod_pic: pic, vod_remarks: remarks });
  }
  return out;
}

function parsePagecount(html) {
  let pc = 1;
  for (const m of html.matchAll(/changePage\((\d+)\)/g)) {
    const n = parseInt(m[1], 10);
    if (n > pc) pc = n;
  }
  return pc;
}

function catOf(tid) {
  return CATS.find(c => c.type_id === String(tid)) || CATS[0];
}

function catUrl(cat, page) {
  page = Math.max(1, page || 1);
  if (cat.kind === 'search') return `${SITE}/search?type=${cat.type}&order=${cat.order}&p=${page}`;
  if (cat.kind === 'main') return `${SITE}/main_ctg?id=${cat.cid}&p=${page}`;
  if (cat.kind === 'tag') return `${SITE}/ctg?id=${cat.cid}&p=${page}`;
  return `${SITE}/model?id=${cat.cid}&p=${page}`;
}

async function buildList(url, page) {
  const html = await getHtml(url);
  if (!html) return { page, pagecount: page, limit: 24, total: 0, list: [] };
  const list = parseCards(html);
  const pc = parsePagecount(html);
  return { page, pagecount: Math.max(pc, page), limit: 24, total: list.length, list };
}

async function init() {
  return {};
}

async function home() {
  const cls = CATS.map(c => ({ type_id: c.type_id, type_name: c.type_name }));
  const filters = {};
  for (const c of FILTER_CATS) filters[c.type_id] = [{ key: 'sub', name: '標籤', value: TAG_FILTER }];
  const html = await getHtml(`${SITE}/search?type=all&order=latest&p=1`);
  const list = html ? parseCards(html) : [];
  return { class: cls, filters, list };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const tid = t(body.tid || body.id) || 's_latest';
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  // 筛选卡片 (123AV 同款): 选中标签则取该标签页, 未选走原分类; 非法 id 忽略
  const extend = body.filters || body.extend || {};
  const sub = t(extend.sub);
  if (sub && TAG_IDS.has(sub)) return buildList(`${SITE}/ctg?id=${sub}&p=${page}`, page);
  const cat = catOf(tid);
  return buildList(catUrl(cat, page), page);
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  let id = t(body.id);
  const idm = id.match(/id=(\d+)/) || id.match(/^(\d+)$/);
  if (idm) id = idm[1];
  if (!id) return { list: [] };
  const durl = `${SITE}/video?id=${id}`;
  const html = await getHtml(durl);
  if (!html) return { list: [] };

  let name = '';
  const h5 = html.match(/<h5[^>]*>([^<]+)<\/h5>/);
  if (h5) name = clean(h5[1]);
  if (!name) {
    const og = html.match(/property="og:title"\s+content="([^"]+)"/);
    if (og) name = clean(og[1]);
  }
  let pic = '';
  const pm = html.match(/(https?:\/\/[^"]+\/media\/video\/large_[^"]+)/);
  if (pm) pic = pm[1];
  const actors = [...new Set([...html.matchAll(/\/model\?id=\d+&name=([^"&]+)/g)].map(x => clean(decodeURIComponent(x[1]))))];
  let date = '';
  const dm = html.match(/<span>(\d{4}-\d{2}-\d{2})<\/span>/);
  if (dm) date = dm[1];

  const vod = {
      vod_id: id,
      vod_name: name || id,
      vod_pic: pic,
      vod_remarks: date,
      vod_actor: actors.join(','),
      vod_content: name,
      vod_play_from: '正片',
      vod_play_url: `720p$${id}`,
  };
  subRegister(body.id, vod);
  return { list: [vod] };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = t(body.id);
  if (id.includes('$')) id = id.split('$').pop().trim();
  const idm = id.match(/id=(\d+)/) || id.match(/^(\d+)$/) || id.match(/(\d+)/);
  if (!idm) return { parse: 0, url: '' };
  const subsP = subSearchAll(subNormKey(id)).catch(() => []);
  const vid = idm[1];
  const eurl = `${SITE}/embed?id=${vid}`;
  const html = await getHtml(eurl, 10000);
  if (html) {
    const m = html.match(/videoSrc\s*=\s*"(https?:\/\/[^"]+?\.m3u8)"/) || html.match(/<video[^>]+src="(https?:\/\/[^"]+?\.m3u8)"/);
    if (m) {
      // 个别文件名带空格，编码掉再返回 (实测 %20 后播放列表/分片均 200)
      const url = m[1].replace(/ /g, '%20');
      return subAttach({ parse: 0, url, header: { 'User-Agent': UA, 'Referer': eurl } }, subsP);
    }
  }
  // 兜底: 嗅探 embed 页
  return subAttach({ parse: 1, jx: 0, url: eurl, header: { 'User-Agent': UA, 'Referer': REFERER } }, subsP);
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const wd = t(body.wd);
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 24, total: 0, list: [] };
  const url = `${SITE}/search?text=${encodeURIComponent(wd)}&p=${page}`;
  return buildList(url, page);
}

// ---------------- 字幕聚合 (Layer A 铺开, 2026-10-23) ----------------
// 与 bestjavporn 试点同一实现 (提交 9c339419, 用户真机确认
// MiraPlayer 可加载并选择字幕): 点播时按片名/番号并行搜迅雷看看
// oracle (首档; 「迅雷」与「迅雷看看」实为同一接口) + SubtitleCat
// (第二档), 合并排序 = 来源档位 -> 语言 (简中>繁中>双语>英文>
// 其他) -> 番号命中 -> 热度, 只收 .srt/.vtt/.ass/.ssa 直链, 上限
// 10 条, 以 TVBox 标准 subs:[{name,url,format}] 挂到 play 结果。
// 总预算 6s、单请求 4~5s、全程框架 req (NOFETCH 安全)、结果缓存
// 10 分钟 (空结果不缓存); 无命中时不带 subs 键, play 返回与接入
// 前逐字段一致。SubHD (下载被站方门控) 与射手 (源站 522) 不接入。
const SUB_UA = (typeof UA !== 'undefined' && UA) ? UA : 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';

function subCleanText(s) {
  return String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

// subHttp: 与试点 reqRaw 同语义 (状态码不抛错、仅 2xx 给正文、
// 文本恒等变换防自动 JSON 解析), 底层框架 req。
async function subHttp(url, headers, timeoutMs) {
  try {
    const r = await req.request({
      method: 'GET',
      url,
      headers: headers || {},
      timeout: timeoutMs || 10000,
      responseType: 'text',
      transformResponse: [(d) => d],
      validateStatus: () => true,
      maxRedirects: 5,
    });
    const text = typeof r.data === 'string' ? r.data : (r.data == null ? '' : String(r.data));
    const ok = r.status >= 200 && r.status < 300;
    return { status: r.status || 0, body: ok ? text : '' };
  } catch (e) {
    return { status: 0, body: '' };
  }
}

// play 入参归一: 个别 App 会把 "集名$播放id" 整段传回, 集名短且
// 不含 {/http 时剥掉前缀, 与 detail 登记的 episode id 对齐。
function subNormKey(k) {
  const s = String(k || '');
  const i = s.indexOf('$');
  if (i > 0) {
    const before = s.slice(0, i);
    if (before.length <= 30 && !/[{/]/.test(before) && !/http/i.test(before)) return s.slice(i + 1).trim();
  }
  return s.trim();
}

// detail 侧登记: 片名按 [detail 入参 id, vod_id, 每个 episode 的
// 播放 id] 多键写入 subNameCache, 并以首个 episode id 预热搜索。
function subRegister(detailIds, vod) {
  try {
    if (!vod || !vod.vod_name) return;
    const name = String(vod.vod_name);
    const keys = new Set();
    for (const i of (Array.isArray(detailIds) ? detailIds : [detailIds])) {
      if (i) keys.add(String(i));
    }
    if (vod.vod_id) keys.add(String(vod.vod_id));
    const eps = [];
    for (const grp of String(vod.vod_play_url || '').split('$$$')) {
      for (const seg of grp.split('#')) {
        const k = seg.indexOf('$');
        if (k >= 0) {
          const ep = seg.slice(k + 1);
          if (ep) { keys.add(ep); eps.push(ep); }
        }
      }
    }
    for (const k of keys) subCacheName(k, name);
    const warmKey = eps[0] || (vod.vod_id ? String(vod.vod_id) : '');
    if (warmKey) subWarm(warmKey);
  } catch (e) { /* 字幕登记失败不影响详情 */ }
}

// play 侧挂载: 仅当结果带非空 url 且字幕有命中时才加 subs 键。
async function subAttach(res, subsP) {
  try {
    const subs = await subsP;
    if (subs && subs.length && res && typeof res === 'object' && res.url) res.subs = subs;
  } catch (e) { /* 字幕挂载失败不影响播放结果 */ }
  return res;
}

// ---------------- 字幕聚合 (Layer A 重写, 2026-10-23) ----------------
// 按用户自有迅雷看看 REX 组件 (xunlei.subtitle) 的方法重写: 旧版把
// [番号, 全标题, 番号+标题] 多个键的召回合并成一池只排序不过滤,
// 全标题键的模糊召回灌进大量别片字幕 (实测 JUR-887 全标题键池
// 前排即 JUX-021 等别片), 且迅雷档位恒占满上限 10, SubtitleCat
// 永远挤不进来。新版三招 (与组件一致):
// (a) 键序逐个查、首个有结果的键即停 — 番号键命中的池小而准;
// (b) 命中后严过滤: 条目 name/langs/ext 须含番号 (宽松形亦可)
//     或片名全文, 不含的全扔, 无回退 (组件原法的回退宽松名单
//     在冷门番号上会把邻近番号的模糊池整池放行, 实测有害已删;
//     乱码单字键亦实测能召回无关字幕, 同样靠严过滤挡下);
// (c) 组件打分: cid_match 100000、含番号 +25000, 再加 oracle 自
//     带 score / fingerprintScore / 下载量, 按名+址去重取 top。
// 槽位 (用户钦定): 迅雷 (键序 [番号, 紧凑番号]) > 迅雷看看
// (组件完整键序 [番号, 紧凑番号, 番号+标题, 紧凑番号+标题,
// 全标题]) > SubtitleCat; 两迅雷槽同走同一 oracle 接口、不管
// 重不重复, 合并按 URL 去重、同条归高档位。合并序 = 档位 ->
// 语言 (简中>繁中>双语>英文>日文>其他, 沿用 subLangOf 口径)
// -> 分数; 全局上限 10、单槽软上限 8 (SubtitleCat 留位)。
// 全程 subHttp (框架 req 主栈), 迅雷系逐请求超时 3s、键序串行
// 首中即停; 总预算 6s、失败全静默; 无结果时 play 返回对象不带
// subs 键, 与未接入前逐字段一致。SubHD (下载被站方门控) 与
// 射手 (源站 522) 仍不接入。
const SUB_TTL = 10 * 60 * 1000;
const subNameCache = new Map();   // durl -> 片名 (detail 时 best-effort 写入)
const subResultCache = new Map(); // durl -> {ts, subs}

function subCacheName(durl, name) {
  if (!durl || !name) return;
  subNameCache.set(durl, String(name));
  if (subNameCache.size > 200) subNameCache.delete(subNameCache.keys().next().value);
}

function subSlugTitle(durl) {
  const slug = (String(durl || '').match(/\/video\/([^/]+)\//) || [])[1] || '';
  return slug ? subCleanText(slug.replace(/[-_]+/g, ' ')) : '';
}

// 番号抽取 (移植自迅雷看看 REX 组件 extractSearchCode 的核心档)
function subExtractCode(text) {
  const s = String(text || '').toUpperCase().replace(/[._]/g, ' ').replace(/\s+/g, ' ');
  const pats = [
    /\bFC2(?:[- ]?PPV)?[- ]?\d{5,8}\b/,
    /\bCARIB(?:PR)?[- ]?\d{6,8}\b/,
    /\b1PONDO[- ]?\d{6,8}\b/,
    /\bHEYZO[- ]?\d{3,6}\b/,
    /\b[A-Z]{2,10}[- ]\d{2,8}[A-Z]?\b/,
    /\b[A-Z]{2,10}\d{2,8}[A-Z]?\b/,
  ];
  for (const re of pats) {
    const m = s.match(re);
    if (m) return m[0].replace(/\s+/g, '-').replace(/-+/g, '-');
  }
  return '';
}

// 搜索上下文: 片名、番号、紧凑番号、标题部分 (去番号与噪声词)
function subCtx(durl) {
  const title = (subNameCache.get(durl) || subSlugTitle(durl) || '').trim();
  const code = subExtractCode(title) || subExtractCode(String(durl || ''));
  const compact = code ? code.replace(/[-_ ]/g, '') : '';
  let titlePart = '';
  if (code && title) {
    titlePart = title
      .replace(new RegExp(code.replace(/[-_]/g, '[-_ ]?'), 'i'), ' ')
      .replace(/\b(UNCENSORED|LEAK|OTHER|COMPLETE|FULL|HDR|WEB|BLURAY|BDRIP|WEBDL|REMUX|X264|X265|10BIT|8BIT|HEVC|AVC)\b/gi, ' ')
      .replace(/\b(?:EP|E|S|SEASON)\s*\d{1,3}\b/gi, ' ')
      .replace(/^[\s\-_:]+|[\s\-_:]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (titlePart === code || titlePart === compact) titlePart = '';
  }
  return { title, code, compact, titlePart };
}

// 迅雷槽键序: 只番号两键 (锚定)
function subKeysX(ctx) {
  const keys = [];
  if (ctx.code) {
    keys.push(ctx.code);
    if (ctx.compact && ctx.compact !== ctx.code) keys.push(ctx.compact);
  }
  return keys;
}

// 迅雷看看槽键序: 组件完整键序 (番号、紧凑番号、番号+标题、
// 紧凑番号+标题、全标题), 逐个查、首中即停。
function subKeysXL(ctx) {
  const keys = subKeysX(ctx);
  if (ctx.code && ctx.titlePart) {
    keys.push(ctx.code + ' ' + ctx.titlePart);
    keys.push(ctx.compact + ' ' + ctx.titlePart);
  }
  if (ctx.title && ctx.title !== ctx.code) keys.push(ctx.title);
  return [...new Set(keys)].filter((k) => k.length >= 2);
}

// 严过滤的匹配文本 (组件口径: 片名 + 上下文, 全小写与去分隔符两形)
function subMatchOf(durl, ctx) {
  const text = ((ctx.title || '') + ' ' + String(durl || '')).trim().toLowerCase();
  const title = (ctx.title || '').toLowerCase();
  return {
    text,
    loose: text.replace(/[-_\s.]/g, ''),
    title,
    titleLoose: title.replace(/[-_\s.]/g, ''),
  };
}

// 语言判定: rank 越小越优先 (简中 > 繁中 > 双语 > 英文 > 其他)
function subLangOf(name, langs) {
  const s = (String(name || '') + ' ' + String(langs || '')).toLowerCase();
  // 尾码优先 (2026-11-07)：SubtitleCat 文件形如 "<标题>-<语码>.srt"，尾码才是文件实际语言；标题里的"简体中文"是原字幕名，不能覆盖尾码。
  const tail = String(name || '').match(/[-_.]([a-z]{2,3})\.(?:srt|vtt|ass|ssa)$/i);
  if (tail) {
    const c = tail[1].toLowerCase();
    if (c === 'zh' || c === 'chs' || c === 'cn' || c === 'hans') return { tag: '简中', rank: 0 };
    if (c === 'cht' || c === 'tw' || c === 'hant') return { tag: '繁中', rank: 1 };
    if (c === 'en' || c === 'eng') return { tag: '英文', rank: 3 };
    if (c === 'ja' || c === 'jpn' || c === 'jp') return { tag: '日文', rank: 4 };
    if (/^(fr|fre|de|ger|es|spa|it|ita|pt|por|ru|rus|nl|dut|sv|swe|da|dan|fi|fin|no|nor|pl|pol|cs|cze|sk|slo|hu|hun|ro|rum|bg|bul|uk|ukr|el|gre|tr|tur|ar|ara|he|heb|hi|hin|id|ind|ms|may|vi|vie|th|tha|km|khm|ko|kor|ak|af|afr|sq|alb|eu|baq|ca|cat|gl|glg|cy|wel|ga|gle|gd|gla|br|bre|co|cos|eo|epo|et|est|lv|lav|lt|lit|mt|mlt|sl|slv|mk|mac|sr|srp|hr|hrv|bs|bos|am|amh|so|som|sw|swa|yo|yor|ig|ibo|ha|hau|zu|zul|xh|xho|st|sot|sn|sna|ka|geo|hy|arm|az|aze|kk|kaz|uz|uzb|mn|mon|ky|kir|tg|tgk|tk|tuk|ti|tir|fa|per|ur|urd|bn|ben|ta|tam|te|tel|ml|mal|mr|mar|pa|pan|gu|guj|kn|kan|as|asm|or|ori|sa|san|ne|nep|si|sin|my|bur|lo|lao)$/.test(c)) return { tag: '', rank: 5 };
  }
  if (/简体|简中|chs|zh[-_. ]?cn|zh[-_. ]?hans/.test(s)) return { tag: '简中', rank: 0 };
  if (/繁体|繁中|cht|zh[-_. ]?tw|zh[-_. ]?hk|zh[-_. ]?hant/.test(s)) return { tag: '繁中', rank: 1 };
  if (/双语|中英|中日|bilingual/.test(s)) return { tag: '双语', rank: 2 };
  if (/英文|english|eng|(^|[-_. ])en([-_. ]|$)/.test(s)) return { tag: '英文', rank: 3 };
  if (/日文|日语|japanese|jpn|(^|[-_. ])ja([-_. ]|$)/.test(s)) return { tag: '日文', rank: 4 };
  return { tag: '', rank: 5 };
}

const SUB_TEXT_RE = /\.(srt|vtt|ass|ssa)(\?|#|$)/i;

// 文本字幕格式判定: 文件名扩展名 > 条目 ext 字段 > url 后缀;
// 压缩包一律剔除 (与组件 getExt 口径一致, 只认 srt/vtt/ass/ssa)。
function subFmtOf(name, ext, url) {
  const hay = (String(name || '') + ' ' + String(url || '')).toLowerCase();
  if (/\.(zip|rar|7z)(\?|#|$)/.test(hay)) return '';
  const fromName = String(name || '').toLowerCase().match(/\.(srt|vtt|ass|ssa)$/);
  if (fromName) return fromName[1];
  const e = String(ext || '').toLowerCase().replace(/^\./, '');
  if (/^(srt|vtt|ass|ssa)$/.test(e)) return e;
  const fromUrl = String(url || '').match(SUB_TEXT_RE);
  if (fromUrl) return fromUrl[1].toLowerCase();
  return '';
}

// 裸哈希名不可读: 显示名换成番号字幕 (匹配/过滤仍用原名)
function subDispName(nm, code) {
  const base = String(nm || '').replace(/\.(srt|vtt|ass|ssa)$/i, '');
  if (/^[0-9a-f]{24,}$/i.test(base.trim())) return code ? code + ' 字幕' : '字幕';
  return nm;
}

// oracle 单键查询 (同趟搜索内按键缓存, 两槽共用, 不重复发请求)
async function subOracle(key, ocache) {
  if (ocache.has(key)) return ocache.get(key);
  const p = (async () => {
    const r = await subHttp('https://api-shoulei-ssl.xunlei.com/oracle/subtitle?name=' + encodeURIComponent(key),
      { 'User-Agent': 'ForwardWidgets/1.0.2', Accept: '*/*' }, 3000);
    if (r.status !== 200 || !r.body) return [];
    let j;
    try { j = JSON.parse(r.body); } catch (e) { return []; }
    if (!j || Number(j.code) !== 0 || !Array.isArray(j.data)) return [];
    return j.data;
  })();
  ocache.set(key, p);
  return p;
}

// oracle 条目归一 (组件 normalizeResult 的字段口径)
function subNormItem(it) {
  const name = String(it.name || it.Name || it.title || it.Title || it.filename || it.FileName || '字幕');
  const langs = Array.isArray(it.languages) ? it.languages.join(',')
    : (Array.isArray(it.Languages) ? it.Languages.join(',') : String(it.langs || it.Langs || it.language || ''));
  return {
    name,
    langs,
    ext: String(it.ext || it.Ext || it.format || it.Format || ''),
    url: String(it.url || it.Url || ''),
    cid: Boolean(it.cid_match ?? it.CidMatch),
    down: Number(it.down_count || it.DownCount || it.downloads || it.Downloads || 0) || 0,
    score: Number(it.score || it.Score || 0) || 0,
    fp: Number(it.fingerprintf_score || it.fingerprint_score || it.FingerprintScore || it.fingerprintfScore || 0) || 0,
    duration: Number(it.duration || it.Duration || 0) || 0,
    size: Number(it.file_size || it.FileSize || it.size || it.Size || 0) || 0,
  };
}

// 严过滤 (组件口径): 条目 name/langs/ext 须含番号 (原形或宽松
// 形) 或片名全文, 否则扔掉。片名分支必须守非空: 个别蜘蛛的
// 播放 id 与 detail 登记键对不上时片名缓存会落空 (title=''),
// 空串是任何字符串的子串, 不守就会全池放行 (bigbuttshub 实测
// 教训: 假番号 EMPTY-24 搜出的 Sherlock 剧集字幕整页漏入)。
function subRelevant(it, ctx, match) {
  const text = (it.name + ' ' + it.langs + ' ' + it.ext).toLowerCase();
  const loose = text.replace(/[-_\s.]/g, '');
  if (ctx.code) {
    if (text.includes(ctx.code.toLowerCase())) return true;
    if (ctx.compact && loose.includes(ctx.compact.toLowerCase())) return true;
  }
  if (!match.text) return false;
  return text.includes(match.text) || loose.includes(match.loose)
    || (match.title ? (text.includes(match.title) || loose.includes(match.titleLoose)) : false)
    || match.text.includes(text);
}

// 组件打分 (scoreItem 的电影路径): cid_match 100000、含番号
// +25000、oracle 自带 score/fingerprintScore、下载量、时长/大小。
function subScoreItem(it, ctx, match) {
  const text = (it.name + ' ' + it.langs + ' ' + it.ext).toLowerCase();
  const loose = text.replace(/[-_\s.]/g, '');
  let s = (it.cid ? 100000 : 0) + it.down / 10000;
  if (ctx.code && (text.includes(ctx.code.toLowerCase()) || (ctx.compact && loose.includes(ctx.compact.toLowerCase())))) s += 25000;
  s += Math.max(0, it.score) + Math.max(0, it.fp);
  if (it.duration > 0) s += 50;
  if (it.size > 0) s += Math.min(it.size / 1024 / 1024, 20);
  if (match.title && (text.includes(match.title) || loose.includes(match.titleLoose))) s += 1000;
  if (ctx.code) s += 500;
  if (text.includes('sub') || text.includes('subtitle') || text.includes('字幕')) s += 300;
  return s;
}

// 迅雷系槽位 (迅雷 tier 0 / 迅雷看看 tier 1): 键序逐个查、首个
// 有结果的键即停; 命中池只过严过滤、无任何回退 — 组件原法的
// 「过滤到空回退宽松名单」在冷门番号上实测有害 (oracle 对无精
// 确字幕的番号返回邻近番号的模糊池, 回退等于整池垃圾放行:
// MOGK-006 挂上 MOGK-004/002、FC2-PPV-4991508 挂上他人番号),
// 与「宁缺毋滥」冲突, 故删除 (与 REX 版相关性闸门口径一致)。
async function subSlotOracle(keys, src, tier, ctx, match, ocache, bag) {
  let pool = null;
  for (const k of keys) {
    const list = await subOracle(k, ocache);
    if (list && list.length) { pool = list; break; }
  }
  if (!pool) return;
  const items = [];
  for (const raw of pool) {
    if (!raw) continue;
    const it = subNormItem(raw);
    if (!it.url) continue;
    const fmt = subFmtOf(it.name, it.ext, it.url);
    if (!fmt) continue;
    items.push({ name: it.name, langs: it.langs, ext: it.ext, url: it.url, fmt, norm: it });
  }
  if (!items.length) return;
  const finalItems = items.filter((it) => subRelevant(it, ctx, match));
  for (const it of finalItems) {
    const lang = subLangOf(it.name, it.langs);
    bag.push({ src, tier, name: subDispName(it.name, ctx.code), url: it.url, fmt: it.fmt, lang: lang.tag, langRank: lang.rank, score: subScoreItem(it.norm, ctx, match), dur: it.norm.duration });
  }
}

// SubtitleCat 槽 (tier 2): 沿用旧芯搜索/解析 (按番号键搜、逐页
// 取按语言分的直链), 同样过严过滤 (无回退)。
async function subFromSubtitleCat(ctx, match, bag) {
  const key = ctx.code || ctx.title;
  if (!key) return;
  const r = await subHttp('https://subtitlecat.com/index.php?search=' + encodeURIComponent(key),
    { 'User-Agent': SUB_UA, Referer: 'https://subtitlecat.com/' }, 5000);
  if (r.status !== 200 || !r.body) return;
  const pages = [];
  const seen = new Set();
  for (const m of r.body.matchAll(/href="(subs\/\d+\/[^"]+\.html)"/g)) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    pages.push(m[1]);
    if (pages.length >= 3) break;
  }
  await Promise.all(pages.map(async (p) => {
    const pr = await subHttp('https://subtitlecat.com/' + p, { 'User-Agent': SUB_UA, Referer: 'https://subtitlecat.com/' }, 4000);
    if (pr.status !== 200 || !pr.body) return;
    for (const m of pr.body.matchAll(/href="(\/subs\/\d+\/[^"]+\.(?:srt|vtt|ass))"/gi)) {
      let nm = m[1].split('/').pop() || '字幕';
      try { nm = decodeURIComponent(nm); } catch (e) { /* 保持原样 */ }
      if (!subRelevant({ name: nm, langs: '', ext: '' }, ctx, match)) continue;
      const lang = subLangOf(nm, '');
      const fmt = (nm.match(/\.(srt|vtt|ass)$/i) || [])[1].toLowerCase();
      bag.push({ src: 'SubtitleCat', tier: 2, name: nm, url: 'https://subtitlecat.com' + m[1], fmt, lang: lang.tag, langRank: lang.rank, score: 0 });
    }
  }));
}

// 合并: 档位 -> 语言 -> 分数; 按 URL 去重 (同条归先到高档位);
// 全局上限 10、单槽软上限 8 (给 SubtitleCat 留位)。
// 时长后缀（2026-11-02）：oracle 给毫秒（>100000 视为毫秒除 1000），
// 秒级原值直接用；无时长不显示、不编造。
// 去重键用秒（2026-11-02 名字+时长口径）：毫秒值 >100000 除 1000；
// 无时长记 nodur（沿用名字去重）；同名同时长才算重复。
function subDurSec(v) {
  let s = Number(v) || 0;
  if (s > 100000) s = Math.floor(s / 1000);
  return s > 0 ? s : 0;
}
function subDurStr(v) {
  let s = Number(v) || 0;
  if (s > 100000) s = Math.floor(s / 1000);
  if (s <= 0) return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? h + ':' + mm + ':' + ss : mm + ':' + ss;
}
function subMerge(items) {
  const sorted = items.slice().sort((a, b) =>
    (a.tier - b.tier) || (a.langRank - b.langRank) || (b.score - a.score) || String(a.name).localeCompare(String(b.name)));
  const seenUrl = new Set();
  const seenName = new Set();
  const perTier = {};
  const out = [];
  for (const it of sorted) {
    if (out.length >= 10) break;
    if (seenUrl.has(it.url)) continue;
    const nameKey = (it.lang || '') + '|' + it.name.toLowerCase().replace(/\.(srt|vtt|ass|ssa)$/i, '') + '|' + (subDurSec(it.dur) || 'nodur');
    if (seenName.has(nameKey)) continue;
    if ((perTier[it.tier] || 0) >= 8) continue;
    seenUrl.add(it.url);
    seenName.add(nameKey);
    perTier[it.tier] = (perTier[it.tier] || 0) + 1;
    const cleanName = it.name.replace(/\.(srt|vtt|ass|ssa)$/i, '').slice(0, 60);
    const dur = subDurStr(it.dur);
    out.push({ name: it.src + '·' + (it.lang ? it.lang + '·' : '') + cleanName + (dur ? '·' + dur : ''), url: it.url, format: it.fmt });
  }
  return out;
}

const subInflight = new Map(); // durl -> Promise<subs> (detail 预热与 play 共用同一趟)

async function subSearchAll(durl) {
  const hit = subResultCache.get(durl);
  if (hit && Date.now() - hit.ts < SUB_TTL) return hit.subs;
  if (subInflight.has(durl)) return subInflight.get(durl);
  const p = (async () => {
    const ctx = subCtx(durl);
    let subs = [];
    if (ctx.code || ctx.title) {
      const match = subMatchOf(durl, ctx);
      const bag = [];
      const ocache = new Map();
      const jobs = [
        subSlotOracle(subKeysX(ctx), '迅雷', 0, ctx, match, ocache, bag),
        subSlotOracle(subKeysXL(ctx), '迅雷看看', 1, ctx, match, ocache, bag),
        subFromSubtitleCat(ctx, match, bag),
      ].map((jp) => Promise.resolve(jp).catch(() => {}));
      const all = Promise.allSettled(jobs);
      // 总预算 6s: 到点先用已入 bag 的部分合并返回; 后台源跑完
      // 后若凑出结果再迟填缓存 (慢出口下 detail 预热靠此命中)。
      // 空结果不缓存 (无字幕的片每次点播重查, 由在途去重兜底)。
      await Promise.race([all, new Promise((r) => setTimeout(r, 6000))]);
      subs = subMerge(bag);
      if (subs.length) {
        subResultCache.set(durl, { ts: Date.now(), subs });
        if (subResultCache.size > 200) subResultCache.delete(subResultCache.keys().next().value);
      } else {
        all.then(() => {
          const late = subMerge(bag);
          if (late.length) {
            subResultCache.set(durl, { ts: Date.now(), subs: late });
            if (subResultCache.size > 200) subResultCache.delete(subResultCache.keys().next().value);
          }
        }).catch(() => {});
      }
    }
    return subs;
  })();
  subInflight.set(durl, p);
  try { return await p; } finally { subInflight.delete(durl); }
}

// detail 入口即预热 (不 await): 慢出口下单趟搜索可达数秒, 让它
// 与详情页的铸造链并行跑, 用户点播时 play 直接命中缓存/在途。
function subWarm(durl) {
  subSearchAll(durl).catch(() => {});
}

export default function createSpider() {
  return {
    meta: { key: KEY, name: NAME, type: 3 },
    api: async (fastify) => {
      fastify.post('/init', init);
      fastify.post('/home', home);
      fastify.post('/category', category);
      fastify.post('/detail', detail);
      fastify.post('/play', play);
      fastify.post('/search', search);
    },
  };
}
