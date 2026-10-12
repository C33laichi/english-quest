# -*- coding: utf-8 -*-
"""
由 28 天语法体系生成语法闯关初始化 SQL
讲义来源：grammar-quest/js/data_raw.json（28 天学完专升本全部语法 PDF 解析结果）
题目：按每日主题编写，每天 3 道单选题
"""
import json

RAW = r"D:\WorkBuddy\WorkPlace\grammar-quest\js\data_raw.json"
OUT = r"D:\WorkBuddy\WorkPlace\english-quest\sql\03_init_grammar.sql"

# 每日题目：题干 | A | B | C | D | 答案 | 解析
QUESTIONS = {
1: [("There are many ______ in the hall.",
     "woman teachers", "women teachers", "woman teacher", "women teacher", "B",
     "man/woman 作定语时，其单复数随中心词一起变化。中心词 teacher 为复数，故用 women teachers。"),
    ("The ______ of the two dictionaries are quite different.",
     "price", "prices", "price's", "prices'", "B",
     "表示两者各自的价格，用复数形式 prices。"),
    ("He gave me some useful ______ on how to learn English well.",
     "advices", "advice", "advise", "advices'", "B",
     "advice 是不可数名词，没有复数形式；advise 是动词，注意区分词性。")],
2: [("She is ______ honest girl and we all like her.",
     "a", "an", "the", "/", "B",
     "honest 中 h 不发音，单词实际以元音音素开头，用不定冠词 an。"),
    ("He plays ______ piano very well, but he doesn't like ______ music.",
     "the, the", "/, the", "the, /", "a, /", "C",
     "乐器名称前加定冠词 the；music 表示泛指，不加冠词。"),
    ("______ Great Wall is one of the wonders in the world.",
     "A", "An", "The", "/", "C",
     "世界上独一无二的事物前用定冠词 the。")],
3: [("The soup tastes ______; I'd like some more.",
     "good", "well", "nicely", "badly", "A",
     "taste 是感官系动词，后接形容词作表语，选 good。"),
    ("Of all the students in our class, he studies ______.",
     "hard", "harder", "hardest", "more hard", "C",
     "三者以上比较用最高级；修饰动词 study 用副词 hardest。"),
    ("The ______ you work, the ______ progress you will make.",
     "harder, greater", "hard, great", "hardest, greatest", "more hard, more great", "A",
     "“the + 比较级，the + 比较级”表示“越……越……”。")],
4: [("I ______ my homework when the phone rang.",
     "did", "was doing", "have done", "do", "B",
     "when 引导的从句用一般过去时，主句动作正在进行，用过去进行时。"),
    ("When I got to the cinema, the film ______ for ten minutes.",
     "had begun", "had been on", "has begun", "began", "B",
     "begin 是短暂性动词，与 for 时间段连用需换成延续性的 be on；表“过去的过去”用过去完成时。"),
    ("She ______ to see me last week, but she didn't come.",
     "was going", "would go", "had gone", "goes", "A",
     "was/were going to do 表示过去打算做但实际未做的事。")],
5: [("Look! The children ______ football on the playground.",
     "play", "played", "are playing", "have played", "C",
     "Look! 提示动作正在发生，用现在进行时。"),
    ("If it ______ tomorrow, we will stay at home.",
     "rains", "will rain", "rained", "is raining", "A",
     "主将从现：if 引导的条件状语从句用一般现在时表示将来。"),
    ("Hurry up! The train ______ in ten minutes.",
     "leaves", "left", "has left", "is left", "A",
     "按时刻表安排的将来动作，用一般现在时表示。")],
6: [("I ______ in this city since 2018.",
     "live", "lived", "have lived", "had lived", "C",
     "since + 时间点与现在完成时连用，表示动作从过去持续到现在。"),
    ("By the end of last year, we ______ over 2000 English words.",
     "learned", "have learned", "had learned", "learn", "C",
     "by the end of + 过去时间，句子用过去完成时。"),
    ("— Have you finished your homework? — Yes, I ______ it an hour ago.",
     "have finished", "finished", "had finished", "finish", "B",
     "句中有明确的过去时间状语 an hour ago，只能用一般过去时。")],
7: [("The bridge ______ last year and now it is in use.",
     "builds", "built", "was built", "has built", "C",
     "桥与“建造”是被动关系，时间为 last year，用一般过去时的被动语态。"),
    ("A new hospital ______ in our town next year.",
     "is built", "will be built", "will build", "is building", "B",
     "医院是“被建造”，且时间为将来，用 will be built。"),
    ("The problem ______ at the meeting now.",
     "discusses", "is discussing", "is being discussed", "has discussed", "C",
     "now 表示动作正在进行，且问题是被讨论，用现在进行时的被动语态。")],
8: [("Neither Tom nor his parents ______ at home now.",
     "is", "are", "was", "has", "B",
     "neither...nor 连接并列主语时遵循就近原则，靠近谓语的是 parents，用复数 are。"),
    ("The number of the students in our school ______ about 2000.",
     "is", "are", "have", "were", "A",
     "the number of 意为“……的数量”，谓语动词用单数。"),
    ("Reading English books ______ my hobby.",
     "are", "is", "were", "be", "B",
     "动名词短语作主语时，谓语动词用单数。")],
9: [("I often hear him ______ English songs in the morning.",
     "sing", "singing", "to sing", "sang", "A",
     "hear sb. do sth. 表示听见某人做某事（强调全过程），动词前不加 to。"),
    ("______ from the top of the hill, the city looks beautiful.",
     "Seeing", "Seen", "To see", "See", "B",
     "城市是“被看”，与逻辑主语是被动关系，用过去分词作状语。"),
    ("He is used to ______ up early every day.",
     "get", "getting", "got", "be got", "B",
     "be used to doing sth. 表示“习惯于做某事”，to 是介词，后接动名词。")],
10: [("The boy ______ by the window is my brother.",
      "stand", "standing", "stood", "to stand", "B",
      "现在分词作后置定语，表示主动、正在进行的动作。"),
     ("He hurried to the station, only ______ that the train had gone.",
      "finding", "found", "to find", "find", "C",
      "only to do 表示出乎意料的结果。"),
     ("______ his homework, he went out to play basketball.",
      "Finished", "Finishing", "To finish", "Having finished", "D",
      "该动作发生在主句动作之前，用现在分词的完成式作时间状语。")],
11: [("— Must I finish the work now? — No, you ______.",
      "mustn't", "needn't", "can't", "shouldn't", "B",
      "must 引导的疑问句，否定回答用 needn't，表示“不必”。"),
     ("He ______ be at home, for the light in his room is on.",
      "can", "must", "need", "may", "B",
      "表示有把握的肯定推测，用 must。"),
     ("You ______ have told her the news; she already knew it.",
      "needn't", "mustn't", "can't", "shouldn't", "A",
      "needn't have done 表示“本不必做某事却做了”。")],
12: [("If I ______ you, I would accept the offer.",
      "am", "was", "were", "be", "C",
      "与现在事实相反的虚拟条件句，be 动词一律用 were。"),
     ("I wish I ______ to the party last night.",
      "went", "had gone", "go", "would go", "B",
      "wish 后的从句表示与过去事实相反，用过去完成时。"),
     ("He suggested that we ______ the meeting until next week.",
      "put off", "putting off", "to put off", "puts off", "A",
      "suggest 表示“建议”时，从句谓语用 (should) + 动词原形。")],
13: [("______ it not been for your help, I couldn't have succeeded.",
      "If", "Had", "Were", "Should", "B",
      "省略 if 的虚拟条件句需倒装，原句为 If it had not been for your help。"),
     ("It is necessary that every student ______ the school rule.",
      "obeys", "obey", "obeyed", "is obeying", "B",
      "It is necessary that 后的主语从句用 (should) + 动词原形。"),
     ("I would rather you ______ tomorrow instead of today.",
      "come", "came", "will come", "would come", "B",
      "would rather 后接从句时，用一般过去时表示对现在或将来的虚拟。")],
14: [("Neither of the two answers ______ correct.",
      "are", "is", "were", "be", "B",
      "neither of + 复数名词作主语，谓语动词用单数。"),
     ("The book ______ cover is red belongs to me.",
      "that", "which", "whose", "who", "C",
      "表示所属关系（书的封面）用关系代词 whose。"),
     ("It was not until midnight ______ he came back home.",
      "that", "when", "which", "then", "A",
      "这是强调句型 It was not until... that...，只能用 that。")],
15: [("Let's go shopping this afternoon, ______?",
      "shall we", "will you", "do we", "don't we", "A",
      "Let's 开头的祈使句，反义疑问部分用 shall we。"),
     ("He hardly ever goes to the cinema, ______?",
      "does he", "doesn't he", "is he", "did he", "A",
      "hardly 表示否定含义，反义疑问部分用肯定形式。"),
     ("I don't think he is right, ______?",
      "do I", "is he", "isn't he", "don't I", "B",
      "主语为第一人称的 I think/believe 结构，反义疑问部分与从句保持一致。")],
16: [("______ beautiful the flowers are!",
      "What", "What a", "How", "How a", "C",
      "how 修饰形容词或副词，构成 How + adj./adv. + 主谓！"),
     ("______ interesting book it is!",
      "What a", "What an", "How", "How an", "B",
      "what 修饰名词，interesting 以元音音素开头，用 What an。"),
     ("______ fast the boy runs!",
      "What", "What a", "How", "How a", "C",
      "how 修饰副词 fast，构成感叹句。")],
17: [("It was in the park ______ I met my old friend.",
      "where", "that", "which", "when", "B",
      "强调句型 It is/was + 被强调部分 + that...，被强调部分是地点状语也用 that。"),
     ("It was he ______ broke the window yesterday.",
      "who", "whom", "which", "whose", "A",
      "强调主语且指人，用 who（也可用 that）。"),
     ("It ______ Tom that helped me with my English last week.",
      "is", "was", "were", "has been", "B",
      "强调过去发生的事情，用 It was...that...。")],
18: [("Hurry up, ______ you will be late for school.",
      "and", "or", "but", "so", "B",
      "祈使句 + or + 陈述句，表示“否则就会……”。"),
     ("Work hard, ______ you will succeed in the end.",
      "and", "or", "but", "for", "A",
      "祈使句 + and + 陈述句，表示“那么就会……”。"),
     ("______ the door, please. It's cold outside.",
      "Close", "Closing", "To close", "Closed", "A",
      "祈使句以动词原形开头。")],
19: [("Only in this way ______ improve your spoken English.",
      "you can", "can you", "you will", "will can you", "B",
      "only + 状语置于句首时，主句用部分倒装。"),
     ("Never ______ such a beautiful scene before.",
      "I have seen", "have I seen", "I saw", "did I saw", "B",
      "否定副词置于句首时，句子用部分倒装，且用现在完成时。"),
     ("Not only ______ interested in music, but also he likes sports.",
      "he is", "is he", "he was", "was he", "B",
      "not only 置于句首时，其后的分句用部分倒装。")],
20: [("It is the third time that he ______ late this week.",
      "is", "was", "has been", "had been", "C",
      "It is the ... time that 从句用现在完成时。"),
     ("This is the room ______ he lived in last year.",
      "which", "where", "that", "what", "C",
      "从句中介词 in 已出现，缺少宾语，用 that（which 亦可，但先行词被限定且选项设置如此）。"),
     ("Neither he nor I ______ able to answer the question.",
      "am", "is", "are", "be", "A",
      "neither...nor 遵循就近原则，靠近谓语的 I 用 am。")],
21: [("The reason ______ he was late is that he missed the bus.",
      "why", "which", "what", "when", "A",
      "先行词为 reason，且在从句中作原因状语，用 why。"),
     ("______ hard he tried, he still failed the exam.",
      "However", "Whatever", "No matter", "Although", "A",
      "however + 形容词/副词，相当于 no matter how。"),
     ("It is high time that we ______ our environment.",
      "protect", "protected", "will protect", "protecting", "B",
      "It is high time that 从句用一般过去时表示虚拟。")],
22: [("______ he said at the meeting surprised everyone.",
      "That", "What", "Which", "It", "B",
      "从句中缺少宾语，用 what 引导主语从句，表示“……的事情”。"),
     ("______ is known to all, the earth moves around the sun.",
      "As", "It", "That", "What", "A",
      "as 引导非限制性定语从句，指代后面整个主句的内容。"),
     ("______ we will go camping tomorrow depends on the weather.",
      "If", "Whether", "That", "What", "B",
      "主语从句表示“是否”时，只能用 whether，不能用 if。")],
23: [("He asked me ______ I had finished my homework.",
      "that", "if", "what", "which", "B",
      "一般疑问句变为宾语从句，用 if/whether 引导。"),
     ("I don't know ______ he will come or not.",
      "if", "whether", "that", "what", "B",
      "与 or not 直接连用时，只能用 whether。"),
     ("Could you tell me ______?",
      "where is the station", "where the station is", "where was the station", "the station where is", "B",
      "宾语从句必须用陈述语序。")],
24: [("The reason why he failed is ______ he didn't work hard.",
      "because", "that", "why", "for", "B",
      "主语为 the reason 时，表语从句用 that 引导，不用 because。"),
     ("It looks ______ it is going to rain.",
      "as", "as if", "that", "like", "B",
      "as if 引导表语从句，表示“看起来好像”。"),
     ("The question is ______ we can finish the task on time.",
      "that", "whether", "if", "what", "B",
      "表语从句中表示“是否”只能用 whether。")],
25: [("The news ______ our team won the match made us excited.",
      "which", "that", "what", "when", "B",
      "从句说明 news 的具体内容且不缺成分，为同位语从句，用 that 引导。"),
     ("The fact ______ he was seriously ill made us worried.",
      "which", "that", "what", "why", "B",
      "同位语从句解释 fact 的内容，用 that 引导且 that 不作成分。"),
     ("I have no idea ______ the meeting will begin.",
      "that", "when", "which", "what", "B",
      "idea 后接同位语从句，表示“会议何时开始”，用连接副词 when。")],
26: [("This is the boy ______ father is a doctor.",
      "who", "whose", "which", "whom", "B",
      "表示所属关系（男孩的父亲），用关系代词 whose。"),
     ("I'll never forget the day ______ we first met.",
      "which", "when", "that", "what", "B",
      "先行词是时间 the day，在从句中作时间状语，用关系副词 when。"),
     ("That is the very book ______ I want to buy.",
      "which", "who", "that", "what", "C",
      "先行词被 the very 修饰时，只能用关系代词 that。")],
27: [("______ he is young, he knows a lot about computers.",
      "Although", "Because", "So", "But", "A",
      "两句之间为让步关系，用 although 引导让步状语从句。"),
     ("He didn't go to bed ______ he finished his homework.",
      "until", "when", "while", "as", "A",
      "not...until 表示“直到……才……”。"),
     ("I will call you ______ I arrive in Beijing.",
      "as soon as", "as long as", "so that", "even if", "A",
      "as soon as 表示“一……就……”，引导时间状语从句。")],
28: [("______ he will attend the meeting is still unknown.",
      "If", "Whether", "That", "What", "B",
      "主语从句表示“是否”，用 whether 引导。"),
     ("This is the house ______ we lived in last year.",
      "where", "which", "what", "whose", "B",
      "从句中介词 in 后缺少宾语，用关系代词 which（或 that）。"),
     ("He asked me ______ I could help him with his English.",
      "that", "if", "what", "which", "B",
      "宾语从句表示“是否”，用 if（或 whether）引导。")],
}


def esc(s):
    return s.replace("\\", "\\\\").replace("'", "''")


def main():
    data = json.load(open(RAW, encoding="utf-8"))
    lessons = []
    for stage in data:
        for day in stage["days"]:
            lessons.append({
                "day": day["globalDay"],
                "title": day["topic"],
                "stage": stage["title"],
                "mode": day.get("mode", "学习"),
                "points": day.get("points", []),
            })
    assert len(lessons) == 28, f"天数异常: {len(lessons)}"

    lines = [
        "-- ============================================================",
        "-- 语法闯关初始化数据（4 阶段 / 28 天 / 84 道题）",
        "-- 讲义来源：《28天学完专升本全部语法》解析结果 data_raw.json",
        "-- ============================================================",
        "USE english_quest;",
        "",
        "DELETE FROM t_grammar_question;",
        "DELETE FROM t_grammar_lesson;",
        "",
    ]

    lesson_rows = []
    for i, lesson in enumerate(lessons, start=1):
        qcount = len(QUESTIONS.get(lesson["day"], []))
        # 注意：必须走 esc()，先转义反斜杠再转义单引号。
        # 只做 replace("'", "''") 会让 json 里的 \" 被 MySQL 还原成 "，导致入库后的 JSON 非法。
        content = esc(json.dumps(lesson["points"], ensure_ascii=False))
        lesson_rows.append(
            "({}, {}, '{}', '{}', '{}', '{}', {}, 60)".format(
                i, lesson["day"], esc(lesson["title"]), esc(lesson["stage"]),
                esc(lesson["mode"]), content, max(qcount, 1)))
    lines.append("INSERT INTO t_grammar_lesson (id, day_no, title, stage, mode, content, question_count, pass_score) VALUES")
    lines.append(",\n".join(lesson_rows) + ";")
    lines.append("")

    question_rows = []
    qid = 0
    for i, lesson in enumerate(lessons, start=1):
        for q in QUESTIONS.get(lesson["day"], []):
            stem, a, b, c, d, ans, analysis = q
            qid += 1
            question_rows.append(
                "({}, {}, 'CHOICE', '{}', '{}', '{}', '{}', '{}', '{}', '{}', '{}', 1)".format(
                    qid, i, esc(stem), esc(a), esc(b), esc(c), esc(d), ans,
                    esc(analysis), esc(lesson["title"])))
    lines.append("INSERT INTO t_grammar_question (id, lesson_id, type, stem, option_a, option_b, option_c, option_d, answer, analysis, knowledge_point, status) VALUES")
    lines.append(",\n".join(question_rows) + ";")
    lines.append("")

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"生成完成：{OUT}")
    print(f"关卡 {len(lessons)} 天，题目 {qid} 道")
    missing = [d for d in range(1, 29) if d not in QUESTIONS]
    print("缺题天数:", missing if missing else "无")


if __name__ == "__main__":
    main()
