# -*- coding: utf-8 -*-
"""
由词库生成词汇闯关初始化 SQL
数据来源：D:\\WorkBuddy\\WorkPlace\\bbdc_3500_words.txt（专升本 3500 词）
释义为人工校对补充，按难度分为 6 个关卡
"""
import random

OUT = r"D:\WorkBuddy\WorkPlace\english-quest\sql\02_init_vocab.sql"

LEVELS = [
    ("基础词汇 I", "BASIC", "专升本高频基础词，适合入门热身"),
    ("基础词汇 II", "BASIC", "常用动词、名词与形容词巩固"),
    ("进阶词汇 I", "INTERMEDIATE", "阅读与完形高频词，重点突破"),
    ("进阶词汇 II", "INTERMEDIATE", "写作常用词与易混词辨析"),
    ("挑战词汇 I", "ADVANCED", "真题高频难词，冲击高分"),
    ("挑战词汇 II", "ADVANCED", "高阶词汇与学术表达"),
]

WORDS = [
    # ---- 关卡1 ----
    [("memory", "记忆；回忆"), ("worry", "担心；烦恼"), ("corner", "角落；拐角"),
     ("slightly", "稍微；轻微地"), ("principle", "原则；原理"), ("fountain", "喷泉"),
     ("superb", "极好的；卓越的"), ("skilled", "熟练的；有技能的"), ("lift", "举起；电梯"),
     ("disabled", "残疾的；丧失能力的"), ("continue", "继续"), ("blackboard", "黑板"),
     ("applaud", "鼓掌；喝彩"), ("jog", "慢跑"), ("useful", "有用的"),
     ("tank", "坦克；水箱"), ("acquire", "获得；学到"), ("foolish", "愚蠢的"),
     ("shower", "淋浴；阵雨"), ("release", "释放；发布"), ("lady", "女士"),
     ("playground", "操场；游乐场"), ("withdraw", "撤回；取款"), ("plot", "情节；阴谋"),
     ("gravity", "重力；严重性"), ("horse", "马"), ("duck", "鸭子"),
     ("white", "白色的"), ("big", "大的"), ("show", "展示；表明")],
    # ---- 关卡2 ----
    [("ladder", "梯子"), ("offence", "冒犯；违法行为"), ("embassy", "大使馆"),
     ("rude", "粗鲁的；无礼的"), ("equip", "装备；配备"), ("mend", "修补；缝补"),
     ("acute", "敏锐的；急性的"), ("eagle", "鹰"), ("personnel", "全体人员；人事部门"),
     ("frustrated", "沮丧的；受挫的"), ("assist", "帮助；协助"), ("carve", "雕刻"),
     ("cartoon", "卡通；漫画"), ("chance", "机会；可能性"), ("apartment", "公寓"),
     ("resource", "资源"), ("resistance", "抵抗；阻力"), ("enthusiastic", "热情的；热心的"),
     ("island", "岛屿"), ("brochure", "小册子；宣传册"), ("coverage", "覆盖；报道"),
     ("straightforward", "直接的；坦率的"), ("golden", "金色的；宝贵的"), ("petrol", "汽油"),
     ("solar", "太阳的；太阳能的"), ("biology", "生物学"), ("battle", "战斗；斗争"),
     ("bridge", "桥；桥梁"), ("logical", "合乎逻辑的"), ("scientist", "科学家")],
    # ---- 关卡3 ----
    [("arrival", "到达；到来"), ("bleed", "流血"), ("nowhere", "无处；到处都不"),
     ("partner", "伙伴；搭档"), ("dozen", "一打；十二个"), ("strength", "力量；实力"),
     ("minister", "部长；大臣"), ("affect", "影响；感动"), ("awake", "醒着的；唤醒"),
     ("struggle", "挣扎；奋斗"), ("conventional", "传统的；常规的"), ("content", "内容；满足的"),
     ("constant", "不断的；恒定的"), ("jaw", "下巴；颌"), ("despair", "绝望"),
     ("critical", "批评的；关键的"), ("sacred", "神圣的"), ("happiness", "幸福；快乐"),
     ("description", "描述；说明"), ("microscope", "显微镜"), ("souvenir", "纪念品"),
     ("brand", "品牌；商标"), ("organic", "有机的"), ("gifted", "有天赋的"),
     ("forest", "森林"), ("document", "文件；文档"), ("climate", "气候"),
     ("directory", "目录；名录"), ("successful", "成功的"), ("usual", "通常的；平常的")],
    # ---- 关卡4 ----
    [("wonder", "想知道；奇迹"), ("doubt", "怀疑；疑问"), ("ahead", "在前面；提前"),
     ("cattle", "牛；牲畜"), ("exact", "精确的；确切的"), ("stage", "舞台；阶段"),
     ("bound", "必然的；被束缚的"), ("atom", "原子"), ("horrible", "可怕的；糟糕的"),
     ("discount", "折扣；打折"), ("solve", "解决；解答"), ("style", "风格；款式"),
     ("definitely", "肯定地；确切地"), ("limit", "限制；界限"), ("mankind", "人类"),
     ("episode", "一集；插曲"), ("fasten", "系紧；扣住"), ("launch", "发射；发起"),
     ("electric", "电的；电动的"), ("ridiculous", "荒谬的；可笑的"), ("decision", "决定；决心"),
     ("factor", "因素；要素"), ("unfold", "展开；显露"), ("realistic", "现实的；逼真的"),
     ("stranger", "陌生人"), ("feather", "羽毛"), ("innovation", "创新；革新"),
     ("ankle", "脚踝"), ("cheat", "欺骗；作弊"), ("twin", "双胞胎之一")],
    # ---- 关卡5 ----
    [("haircut", "理发"), ("uniform", "制服；统一的"), ("painful", "痛苦的；疼痛的"),
     ("hence", "因此；从此"), ("delighted", "高兴的；愉快的"), ("emphasize", "强调；着重"),
     ("enjoyable", "令人愉快的"), ("force", "力量；迫使"), ("debt", "债务；欠款"),
     ("familiar", "熟悉的"), ("passive", "被动的；消极的"), ("select", "挑选；选择"),
     ("argument", "争论；论点"), ("endless", "无尽的；无穷的"), ("glance", "瞥见；一瞥"),
     ("ambulance", "救护车"), ("award", "奖励；授予"), ("apparent", "明显的；表面上的"),
     ("grace", "优雅；恩惠"), ("medal", "奖牌；勋章"), ("amusement", "娱乐；消遣"),
     ("declare", "宣布；声明"), ("crossroads", "十字路口"), ("vision", "视力；视野"),
     ("crime", "犯罪；罪行"), ("rapid", "迅速的；快速的"), ("factory", "工厂"),
     ("receptionist", "接待员"), ("agreement", "协议；同意"), ("friction", "摩擦；摩擦力")],
    # ---- 关卡6 ----
    [("silent", "沉默的；安静的"), ("primary", "主要的；初级的"), ("glory", "荣耀；光荣"),
     ("household", "家庭的；家庭"), ("square", "广场；正方形"), ("drought", "干旱"),
     ("primitive", "原始的；简陋的"), ("dive", "潜水；跳水"), ("honour", "荣誉；尊敬"),
     ("athlete", "运动员"), ("expression", "表达；表情"), ("genius", "天才；天赋"),
     ("participate", "参加；参与"), ("object", "物体；反对"), ("victory", "胜利"),
     ("minimum", "最小的；最低限度"), ("ending", "结局；结尾"), ("massive", "巨大的；大量的"),
     ("sour", "酸的"), ("freeze", "冻结；结冰"), ("irrigate", "灌溉"),
     ("gesture", "手势；姿态"), ("phenomenon", "现象"), ("belief", "信念；信仰"),
     ("coal", "煤；煤块"), ("inspection", "检查；视察"), ("absorb", "吸收；吸引"),
     ("evolution", "进化；演变"), ("typical", "典型的；有代表性的"), ("appreciate", "欣赏；感激")],
]


def esc(s):
    return s.replace("\\", "\\\\").replace("'", "''")


def main():
    random.seed(20260910)
    lines = [
        "-- ============================================================",
        "-- 词汇闯关初始化数据（6 个关卡 / 180 个单词 / 240 道题目）",
        "-- 词源：bbdc_3500_words.txt（专升本核心词汇）",
        "-- ============================================================",
        "USE english_quest;",
        "",
        "DELETE FROM t_vocab_question;",
        "DELETE FROM t_vocab_level;",
        "",
        "INSERT INTO t_vocab_level (id, name, difficulty, description, question_count, pass_score, sort_no, status) VALUES",
    ]
    level_rows = []
    for i, (name, diff, desc) in enumerate(LEVELS, start=1):
        level_rows.append(f"({i}, '{esc(name)}', '{diff}', '{esc(desc)}', 10, 60, {i}, 1)")
    lines.append(",\n".join(level_rows) + ";")
    lines.append("")

    question_rows = []
    qid = 0
    for li, words in enumerate(WORDS, start=1):
        meanings = [m for _, m in words]
        for wi, (word, meaning) in enumerate(words):
            # 选择题：英译中
            distractors = random.sample([m for m in meanings if m != meaning], 3)
            options = distractors + [meaning]
            random.shuffle(options)
            answer = "ABCD"[options.index(meaning)]
            qid += 1
            question_rows.append(
                "({}, {}, 'CHOICE', '{}', NULL, '{}', '{}', '{}', '{}', '{}', '{}', '{}', 1)".format(
                    qid, li, esc(word), esc(meaning),
                    esc(options[0]), esc(options[1]), esc(options[2]), esc(options[3]),
                    answer,
                    esc(f"{word} 的中文释义是「{meaning}」，注意与形近词、近义词区分。")))

            # 拼写题：中译英（每 3 个单词出 1 题）
            if wi % 3 == 1:
                qid += 1
                question_rows.append(
                    "({}, {}, 'SPELL', '{}', NULL, '{}', NULL, NULL, NULL, NULL, '{}', '{}', 1)".format(
                        qid, li, esc(word), esc(meaning), esc(word),
                        esc(f"「{meaning}」对应的英文单词是 {word}，注意拼写与词形。")))

    lines.append("INSERT INTO t_vocab_question (id, level_id, type, word, phonetic, meaning, option_a, option_b, option_c, option_d, answer, analysis, status) VALUES")
    lines.append(",\n".join(question_rows) + ";")
    lines.append("")

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"生成完成：{OUT}")
    print(f"关卡 {len(LEVELS)} 个，单词 {sum(len(w) for w in WORDS)} 个，题目 {qid} 道")
    for i, w in enumerate(WORDS, start=1):
        print(f"  关卡{i}: {len(w)} 词")


if __name__ == "__main__":
    main()
