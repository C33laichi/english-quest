# -*- coding: utf-8 -*-
"""
听力听写模块数据生成器
生成 sql/05_init_listen.sql：建表 + 6 个关卡 + 150 句语料

语料按专升本英语难度递进编排：
  第 1 关 基础短句   3-5 词
  第 2 关 日常起居   5-7 词
  第 3 关 校园学习   6-8 词
  第 4 关 社会话题   8-10 词
  第 5 关 观点表达   10-13 词
  第 6 关 长句挑战   13-16 词
"""
import os
import re

# ============================================================
# 语料：(英文句子, 中文译文)
# ============================================================

LEVEL_1 = [
    ("I like this food.", "我喜欢这个食物。"),
    ("She is my sister.", "她是我姐姐。"),
    ("The weather is nice.", "天气很好。"),
    ("We go to school.", "我们去上学。"),
    ("He can swim well.", "他游泳游得好。"),
    ("This book is interesting.", "这本书很有趣。"),
    ("My father is a doctor.", "我父亲是医生。"),
    ("They live in Beijing.", "他们住在北京。"),
    ("I have two brothers.", "我有两个兄弟。"),
    ("She likes music very much.", "她非常喜欢音乐。"),
    ("The cat is sleeping.", "猫在睡觉。"),
    ("Please open the window.", "请打开窗户。"),
    ("I am very hungry now.", "我现在很饿。"),
    ("Time is very important.", "时间非常重要。"),
    ("He works in a bank.", "他在银行工作。"),
    ("We are good friends.", "我们是好朋友。"),
    ("The sky is blue today.", "今天天空是蓝色的。"),
    ("She bought a new phone.", "她买了一个新手机。"),
    ("I want some coffee.", "我想要一些咖啡。"),
    ("They are playing football.", "他们在踢足球。"),
    ("My mother cooks well.", "我妈妈做饭很好吃。"),
    ("This is my first time.", "这是我的第一次。"),
    ("He runs very fast.", "他跑得很快。"),
    ("The train is late again.", "火车又晚点了。"),
    ("I forgot my keys.", "我忘了带钥匙。"),
]

LEVEL_2 = [
    ("I usually get up at seven.", "我通常七点起床。"),
    ("She takes a walk after dinner.", "她晚饭后散步。"),
    ("We have breakfast together every morning.", "我们每天早上一起吃早饭。"),
    ("He goes to bed very late.", "他很晚才睡觉。"),
    ("My brother cleans his room on weekends.", "我弟弟周末打扫房间。"),
    ("I need to buy some vegetables.", "我需要买些蔬菜。"),
    ("They often watch movies at home.", "他们经常在家看电影。"),
    ("She is cooking dinner in the kitchen.", "她正在厨房做晚饭。"),
    ("I brush my teeth twice a day.", "我一天刷两次牙。"),
    ("The supermarket closes at ten o'clock.", "超市十点关门。"),
    ("We should drink more water every day.", "我们应该每天多喝水。"),
    ("He is washing his car outside.", "他在外面洗车。"),
    ("My sister is learning to cook.", "我妹妹在学做饭。"),
    ("I forgot to turn off the light.", "我忘了关灯。"),
    ("They moved to a new apartment.", "他们搬进了新公寓。"),
    ("She always keeps her desk clean.", "她总是保持桌子整洁。"),
    ("We are planning a trip this weekend.", "我们计划这个周末去旅行。"),
    ("I spent the whole morning cleaning.", "我花了一上午打扫卫生。"),
    ("He is looking for his glasses.", "他在找他的眼镜。"),
    ("My neighbors are very friendly people.", "我的邻居们非常友好。"),
    ("I will call you back later.", "我晚点给你回电话。"),
    ("She put the milk in the fridge.", "她把牛奶放进了冰箱。"),
    ("We ran out of paper towels.", "我们的纸巾用完了。"),
    ("He fixed the broken chair yesterday.", "他昨天修好了那把坏椅子。"),
    ("I prefer tea to coffee.", "比起咖啡我更喜欢茶。"),
]

LEVEL_3 = [
    ("Our English teacher is very patient.", "我们的英语老师很有耐心。"),
    ("I have three classes this morning.", "我今天上午有三节课。"),
    ("The library opens at eight every day.", "图书馆每天八点开门。"),
    ("We need to hand in our homework.", "我们需要交作业。"),
    ("She got the highest score in class.", "她在班上得了最高分。"),
    ("I joined the school basketball team.", "我加入了校篮球队。"),
    ("Our school has a big playground.", "我们学校有一个大操场。"),
    ("The exam will start next Monday morning.", "考试将于下周一开始。"),
    ("He is preparing for the entrance exam.", "他正在准备入学考试。"),
    ("Reading English aloud helps improve pronunciation.", "大声朗读英语有助于改善发音。"),
    ("I take notes carefully during every lecture.", "我每节课都认真记笔记。"),
    ("My classmates are friendly and helpful.", "我的同学们友好又乐于助人。"),
    ("We often practice speaking after class.", "我们经常在课后练习口语。"),
    ("The teacher explained the grammar point twice.", "老师把这个语法点讲了两遍。"),
    ("I borrowed three books from the library.", "我从图书馆借了三本书。"),
    ("She is good at math and physics.", "她擅长数学和物理。"),
    ("Our class won the singing competition.", "我们班赢得了歌唱比赛。"),
    ("You should review your lessons every day.", "你应该每天复习功课。"),
    ("The school canteen serves cheap and delicious food.", "学校食堂提供便宜又好吃的食物。"),
    ("I made a study plan for this term.", "我为这个学期制定了学习计划。"),
    ("He missed the class because he was ill.", "他因为生病缺课了。"),
    ("Writing a diary in English is useful.", "用英语写日记很有用。"),
    ("We discussed the question in small groups.", "我们分小组讨论了这个问题。"),
    ("My vocabulary has improved a lot recently.", "最近我的词汇量提高了很多。"),
    ("The final exam is only two weeks away.", "期末考试只剩两周了。"),
]

LEVEL_4 = [
    ("More and more people choose to study online.", "越来越多的人选择在线学习。"),
    ("The Internet has changed the way we live.", "互联网改变了我们的生活方式。"),
    ("Protecting the environment is everyone's responsibility.", "保护环境是每个人的责任。"),
    ("Many young people prefer to work in big cities.", "许多年轻人更愿意在大城市工作。"),
    ("Reading books can broaden our horizons.", "读书可以开阔我们的视野。"),
    ("We should pay more attention to mental health.", "我们应该更多地关注心理健康。"),
    ("The government has built many new roads.", "政府修建了许多新道路。"),
    ("Learning a foreign language takes time and patience.", "学习一门外语需要时间和耐心。"),
    ("Air pollution is a serious problem in many cities.", "空气污染在许多城市是个严重问题。"),
    ("People are paying more attention to healthy eating.", "人们越来越关注健康饮食。"),
    ("Technology makes our daily life much more convenient.", "科技让我们的日常生活方便多了。"),
    ("Many students take part-time jobs during the holidays.", "许多学生在假期做兼职。"),
    ("Exercise is a good way to reduce stress.", "锻炼是减轻压力的好方法。"),
    ("The number of private cars keeps growing.", "私家车的数量持续增长。"),
    ("We should learn to manage our time wisely.", "我们应该学会明智地管理时间。"),
    ("Online shopping has become part of daily life.", "网上购物已成为日常生活的一部分。"),
    ("Volunteering helps us understand the real world.", "志愿服务帮助我们了解真实世界。"),
    ("Some people think money is the key to happiness.", "有些人认为金钱是幸福的关键。"),
    ("The city is becoming more crowded than before.", "这座城市比以前更拥挤了。"),
    ("Good communication skills are important in teamwork.", "良好的沟通能力在团队合作中很重要。"),
    ("Many families are moving to the countryside.", "许多家庭正在搬到乡下。"),
    ("We must stop wasting water and electricity.", "我们必须停止浪费水和电。"),
    ("Children spend too much time on mobile phones.", "孩子们在手机上花了太多时间。"),
    ("Education is the best investment for the future.", "教育是对未来最好的投资。"),
    ("Sharing ideas with others can solve problems faster.", "与他人分享想法可以更快地解决问题。"),
]

LEVEL_5 = [
    ("In my opinion, students should be encouraged to think independently.", "在我看来，应该鼓励学生独立思考。"),
    ("Although he was tired, he kept working until midnight.", "尽管他很累，他还是工作到半夜。"),
    ("The more you practice, the more confident you will become.", "你练得越多，就会越自信。"),
    ("It is important to keep a balance between work and rest.", "保持工作与休息的平衡很重要。"),
    ("What matters most is not talent but hard work.", "最重要的不是天赋而是努力。"),
    ("I believe that hard work will finally pay off.", "我相信努力最终会有回报。"),
    ("Nobody can succeed without making any mistakes.", "没有人能不犯任何错误就成功。"),
    ("We should not judge a person by his appearance.", "我们不应该以貌取人。"),
    ("The reason why he failed is that he gave up.", "他失败的原因是他放弃了。"),
    ("It is necessary for us to learn from our mistakes.", "我们有必要从错误中学习。"),
    ("Compared with the past, life is much better now.", "与过去相比，现在的生活好多了。"),
    ("As long as you keep trying, you will make progress.", "只要你不断尝试，就会取得进步。"),
    ("He studies so hard that he often forgets to eat.", "他学习如此努力以至于常常忘了吃饭。"),
    ("Before making a decision, you should think it over carefully.", "做决定之前，你应该仔细考虑。"),
    ("The problem is that we do not have enough time.", "问题是我们没有足够的时间。"),
    ("I would rather walk than take a crowded bus.", "我宁愿走路也不愿坐拥挤的公交车。"),
    ("No matter how difficult it is, I will not give up.", "无论多难，我都不会放弃。"),
    ("It took me three years to master this skill.", "我花了三年时间才掌握这项技能。"),
    ("The book is so interesting that I read it twice.", "这本书太有趣了以至于我读了两遍。"),
    ("We are supposed to finish the task before Friday.", "我们应该在周五之前完成这项任务。"),
    ("There is no doubt that reading improves our thinking.", "毫无疑问，阅读能改善我们的思维。"),
    ("He was too excited to say a single word.", "他太激动了，一个字都说不出来。"),
    ("The earlier you start, the more chances you will have.", "你开始得越早，机会就越多。"),
    ("What he said made all of us think deeply.", "他说的话让我们所有人都深思。"),
    ("As far as I am concerned, honesty comes first.", "就我而言，诚实最重要。"),
]

LEVEL_6 = [
    ("Many students find it difficult to balance study, part-time jobs and social activities.", "很多学生觉得很难平衡学习、兼职和社交活动。"),
    ("With the rapid development of technology, our way of learning has changed greatly.", "随着科技的快速发展，我们的学习方式发生了巨大变化。"),
    ("If you want to improve your English, you must practice listening and speaking every day.", "如果你想提高英语，就必须每天练习听力和口语。"),
    ("The teacher suggested that we should read at least one English article every day.", "老师建议我们每天至少读一篇英语文章。"),
    ("People who exercise regularly are usually healthier and more energetic than those who do not.", "经常锻炼的人通常比不锻炼的人更健康、更有活力。"),
    ("Although online learning is convenient, it still cannot completely replace traditional classrooms.", "虽然在线学习很方便，但它仍然无法完全取代传统课堂。"),
    ("The most important thing is that we should never stop learning new things.", "最重要的是我们永远不应该停止学习新事物。"),
    ("Parents should encourage their children to solve problems by themselves instead of helping too much.", "父母应该鼓励孩子自己解决问题，而不是过度帮助。"),
    ("It is reported that more than half of the students have part-time work experience.", "据报道，超过一半的学生有兼职工作经验。"),
    ("In order to achieve your goal, you need a clear plan and strong self-control.", "为了实现目标，你需要清晰的计划和强大的自控力。"),
    ("The environment we live in today is much worse than it was twenty years ago.", "我们今天所生活的环境比二十年前糟糕得多。"),
    ("Whenever I meet difficulties in my study, I always ask my teachers for help.", "每当我在学习中遇到困难，我总是向老师求助。"),
    ("What we need is not only knowledge, but also the ability to use it.", "我们需要的不仅是知识，还有运用知识的能力。"),
    ("Reading widely can help you build a larger vocabulary and understand different cultures.", "广泛阅读能帮你积累更大的词汇量并理解不同文化。"),
    ("Many people believe that a good education is the surest way to a better life.", "许多人相信良好的教育是通往更好生活最可靠的途径。"),
    ("The company decided to offer more training programs for its new employees.", "公司决定为新员工提供更多培训项目。"),
    ("Even though it was raining heavily, they continued to work in the field.", "尽管雨下得很大，他们仍继续在田里干活。"),
    ("It is a good idea to review what you have learned before going to bed.", "睡前复习所学的内容是个好主意。"),
    ("Young people today face more pressure than their parents did at the same age.", "今天的年轻人比他们父母在同龄时面临更大的压力。"),
    ("The more carefully you listen, the more details you will be able to catch.", "你听得越仔细，能抓住的细节就越多。"),
    ("We should try our best to protect the earth for future generations.", "我们应该尽最大努力为后代保护地球。"),
    ("He explained the problem so clearly that everyone understood it immediately.", "他把问题解释得如此清楚，以至于每个人都立刻明白了。"),
    ("There are many ways to improve your English, but none of them works without practice.", "提高英语的方法有很多，但没有练习哪种都不行。"),
    ("A person who keeps learning throughout his life will never fall behind the times.", "一个终身学习的人永远不会落后于时代。"),
    ("The success of a team depends on how well its members work together.", "一个团队的成功取决于成员之间配合得有多好。"),
]

LEVELS = [
    ("基础短句", "BASIC", "3~5 词的日常短句，适合刚开始练听力打字", 70, LEVEL_1),
    ("日常起居", "BASIC", "生活场景常用句，含时间、频率等表达", 70, LEVEL_2),
    ("校园学习", "INTERMEDIATE", "校园与学习场景，句子结构开始变长", 65, LEVEL_3),
    ("社会话题", "INTERMEDIATE", "科技、环保、健康等话题，长词组增多", 65, LEVEL_4),
    ("观点表达", "ADVANCED", "含从句与固定句型，考验连读听辨", 60, LEVEL_5),
    ("长句挑战", "ADVANCED", "13 词以上复合长句，专升本阅读同源难度", 60, LEVEL_6),
]


def esc(s):
    """SQL 单引号转义"""
    return s.replace("\\", "\\\\").replace("'", "''")


def word_count(sentence):
    """归一化后统计单词数（去掉标点，撇号并入单词）"""
    s = sentence.lower().replace("'", "").replace("’", "")
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    return len([w for w in s.split() if w])


SCHEMA = """-- ============================================================
-- 听力听写模块  DDL + 初始化语料
-- 由 scripts/gen_listen_sql.py 生成，请勿手工修改
-- ============================================================
USE english_quest;

-- ------------------------------------------------------------
-- 13. 听力关卡表
-- ------------------------------------------------------------
DROP TABLE IF EXISTS t_listen_level;
CREATE TABLE t_listen_level (
  id             BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
  name           VARCHAR(50) NOT NULL                COMMENT '关卡名称',
  difficulty     VARCHAR(20) NOT NULL DEFAULT 'BASIC' COMMENT '难度：BASIC / INTERMEDIATE / ADVANCED',
  description    VARCHAR(255)         DEFAULT NULL   COMMENT '关卡描述',
  question_count INT         NOT NULL DEFAULT 10     COMMENT '每次练习抽句数',
  pass_score     INT         NOT NULL DEFAULT 60     COMMENT '及格分',
  sort_no        INT         NOT NULL DEFAULT 0      COMMENT '排序号',
  status         TINYINT     NOT NULL DEFAULT 1      COMMENT '状态：1 启用 0 停用',
  create_time    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_sort (sort_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='听力关卡表';

-- ------------------------------------------------------------
-- 14. 听力句子语料表
--    设计说明：
--      english/chinese 是答案数据，练习时绝不整句下发；
--      简单模式只下发 word_count（词数）供前端画长度提示，
--      困难模式连词数都不下发，避免答案可从网络响应推断。
-- ------------------------------------------------------------
DROP TABLE IF EXISTS t_listen_sentence;
CREATE TABLE t_listen_sentence (
  id          BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
  level_id    BIGINT       NOT NULL                COMMENT '所属关卡',
  english     VARCHAR(500) NOT NULL                COMMENT '英文原句（答案）',
  chinese     VARCHAR(500) NOT NULL                COMMENT '中文译文',
  word_count  INT          NOT NULL DEFAULT 0      COMMENT '归一化后的单词数',
  sort_no     INT          NOT NULL DEFAULT 0      COMMENT '排序号',
  status      TINYINT      NOT NULL DEFAULT 1      COMMENT '状态：1 启用 0 停用',
  create_time DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_level (level_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='听力听写句子语料表';
"""


def main():
    out = [SCHEMA]

    # ---------- 关卡 ----------
    out.append("-- ---------- 听力关卡 ----------")
    out.append("DELETE FROM t_listen_level;")
    rows = []
    for i, (name, diff, desc, pass_score, sentences) in enumerate(LEVELS, start=1):
        rows.append(
            "({}, '{}', '{}', '{}', 10, {}, {}, 1)".format(
                i, esc(name), diff, esc(desc), pass_score, i
            )
        )
    out.append(
        "INSERT INTO t_listen_level (id, name, difficulty, description, question_count, pass_score, sort_no, status) VALUES\n"
        + ",\n".join(rows)
        + ";"
    )
    out.append("")

    # ---------- 句子 ----------
    out.append("-- ---------- 听力语料 ----------")
    out.append("DELETE FROM t_listen_sentence;")
    sid = 0
    for level_id, (name, diff, desc, pass_score, sentences) in enumerate(LEVELS, start=1):
        assert len(sentences) == 25, f"{name} 句子数应为 25，实际 {len(sentences)}"
        rows = []
        for sort_no, (en, zh) in enumerate(sentences, start=1):
            sid += 1
            wc = word_count(en)
            assert 2 <= wc <= 20, f"词数异常({wc})：{en}"
            rows.append(
                "({}, {}, '{}', '{}', {}, {})".format(
                    sid, level_id, esc(en), esc(zh), wc, sort_no
                )
            )
        out.append(
            "-- 第 {} 关：{}（{} 句）".format(level_id, name, len(sentences))
        )
        out.append(
            "INSERT INTO t_listen_sentence (id, level_id, english, chinese, word_count, sort_no) VALUES\n"
            + ",\n".join(rows)
            + ";"
        )
        out.append("")

    # ---------- 每日任务：补充听力任务 ----------
    out.append("-- ---------- 每日任务：新增听力听写任务 ----------")
    out.append(
        "INSERT INTO t_daily_task (code, title, task_type, target_value, reward_points, sort_no, status) "
        "VALUES ('DAILY_LISTEN', '完成 1 次听力听写', 'LISTEN_COUNT', 1, 10, 4, 1)\n"
        "ON DUPLICATE KEY UPDATE title = VALUES(title), task_type = VALUES(task_type), "
        "target_value = VALUES(target_value), reward_points = VALUES(reward_points), status = 1;"
    )
    out.append("")

    path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sql", "05_init_listen.sql")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(out))
    print("已生成:", path)
    print("关卡数:", len(LEVELS), " 句子总数:", sid)


if __name__ == "__main__":
    main()
