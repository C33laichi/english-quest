-- ============================================================
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

-- ---------- 听力关卡 ----------
DELETE FROM t_listen_level;
INSERT INTO t_listen_level (id, name, difficulty, description, question_count, pass_score, sort_no, status) VALUES
(1, '基础短句', 'BASIC', '3~5 词的日常短句，适合刚开始练听力打字', 10, 70, 1, 1),
(2, '日常起居', 'BASIC', '生活场景常用句，含时间、频率等表达', 10, 70, 2, 1),
(3, '校园学习', 'INTERMEDIATE', '校园与学习场景，句子结构开始变长', 10, 65, 3, 1),
(4, '社会话题', 'INTERMEDIATE', '科技、环保、健康等话题，长词组增多', 10, 65, 4, 1),
(5, '观点表达', 'ADVANCED', '含从句与固定句型，考验连读听辨', 10, 60, 5, 1),
(6, '长句挑战', 'ADVANCED', '13 词以上复合长句，专升本阅读同源难度', 10, 60, 6, 1);

-- ---------- 听力语料 ----------
DELETE FROM t_listen_sentence;
-- 第 1 关：基础短句（25 句）
INSERT INTO t_listen_sentence (id, level_id, english, chinese, word_count, sort_no) VALUES
(1, 1, 'I like this food.', '我喜欢这个食物。', 4, 1),
(2, 1, 'She is my sister.', '她是我姐姐。', 4, 2),
(3, 1, 'The weather is nice.', '天气很好。', 4, 3),
(4, 1, 'We go to school.', '我们去上学。', 4, 4),
(5, 1, 'He can swim well.', '他游泳游得好。', 4, 5),
(6, 1, 'This book is interesting.', '这本书很有趣。', 4, 6),
(7, 1, 'My father is a doctor.', '我父亲是医生。', 5, 7),
(8, 1, 'They live in Beijing.', '他们住在北京。', 4, 8),
(9, 1, 'I have two brothers.', '我有两个兄弟。', 4, 9),
(10, 1, 'She likes music very much.', '她非常喜欢音乐。', 5, 10),
(11, 1, 'The cat is sleeping.', '猫在睡觉。', 4, 11),
(12, 1, 'Please open the window.', '请打开窗户。', 4, 12),
(13, 1, 'I am very hungry now.', '我现在很饿。', 5, 13),
(14, 1, 'Time is very important.', '时间非常重要。', 4, 14),
(15, 1, 'He works in a bank.', '他在银行工作。', 5, 15),
(16, 1, 'We are good friends.', '我们是好朋友。', 4, 16),
(17, 1, 'The sky is blue today.', '今天天空是蓝色的。', 5, 17),
(18, 1, 'She bought a new phone.', '她买了一个新手机。', 5, 18),
(19, 1, 'I want some coffee.', '我想要一些咖啡。', 4, 19),
(20, 1, 'They are playing football.', '他们在踢足球。', 4, 20),
(21, 1, 'My mother cooks well.', '我妈妈做饭很好吃。', 4, 21),
(22, 1, 'This is my first time.', '这是我的第一次。', 5, 22),
(23, 1, 'He runs very fast.', '他跑得很快。', 4, 23),
(24, 1, 'The train is late again.', '火车又晚点了。', 5, 24),
(25, 1, 'I forgot my keys.', '我忘了带钥匙。', 4, 25);

-- 第 2 关：日常起居（25 句）
INSERT INTO t_listen_sentence (id, level_id, english, chinese, word_count, sort_no) VALUES
(26, 2, 'I usually get up at seven.', '我通常七点起床。', 6, 1),
(27, 2, 'She takes a walk after dinner.', '她晚饭后散步。', 6, 2),
(28, 2, 'We have breakfast together every morning.', '我们每天早上一起吃早饭。', 6, 3),
(29, 2, 'He goes to bed very late.', '他很晚才睡觉。', 6, 4),
(30, 2, 'My brother cleans his room on weekends.', '我弟弟周末打扫房间。', 7, 5),
(31, 2, 'I need to buy some vegetables.', '我需要买些蔬菜。', 6, 6),
(32, 2, 'They often watch movies at home.', '他们经常在家看电影。', 6, 7),
(33, 2, 'She is cooking dinner in the kitchen.', '她正在厨房做晚饭。', 7, 8),
(34, 2, 'I brush my teeth twice a day.', '我一天刷两次牙。', 7, 9),
(35, 2, 'The supermarket closes at ten o''clock.', '超市十点关门。', 6, 10),
(36, 2, 'We should drink more water every day.', '我们应该每天多喝水。', 7, 11),
(37, 2, 'He is washing his car outside.', '他在外面洗车。', 6, 12),
(38, 2, 'My sister is learning to cook.', '我妹妹在学做饭。', 6, 13),
(39, 2, 'I forgot to turn off the light.', '我忘了关灯。', 7, 14),
(40, 2, 'They moved to a new apartment.', '他们搬进了新公寓。', 6, 15),
(41, 2, 'She always keeps her desk clean.', '她总是保持桌子整洁。', 6, 16),
(42, 2, 'We are planning a trip this weekend.', '我们计划这个周末去旅行。', 7, 17),
(43, 2, 'I spent the whole morning cleaning.', '我花了一上午打扫卫生。', 6, 18),
(44, 2, 'He is looking for his glasses.', '他在找他的眼镜。', 6, 19),
(45, 2, 'My neighbors are very friendly people.', '我的邻居们非常友好。', 6, 20),
(46, 2, 'I will call you back later.', '我晚点给你回电话。', 6, 21),
(47, 2, 'She put the milk in the fridge.', '她把牛奶放进了冰箱。', 7, 22),
(48, 2, 'We ran out of paper towels.', '我们的纸巾用完了。', 6, 23),
(49, 2, 'He fixed the broken chair yesterday.', '他昨天修好了那把坏椅子。', 6, 24),
(50, 2, 'I prefer tea to coffee.', '比起咖啡我更喜欢茶。', 5, 25);

-- 第 3 关：校园学习（25 句）
INSERT INTO t_listen_sentence (id, level_id, english, chinese, word_count, sort_no) VALUES
(51, 3, 'Our English teacher is very patient.', '我们的英语老师很有耐心。', 6, 1),
(52, 3, 'I have three classes this morning.', '我今天上午有三节课。', 6, 2),
(53, 3, 'The library opens at eight every day.', '图书馆每天八点开门。', 7, 3),
(54, 3, 'We need to hand in our homework.', '我们需要交作业。', 7, 4),
(55, 3, 'She got the highest score in class.', '她在班上得了最高分。', 7, 5),
(56, 3, 'I joined the school basketball team.', '我加入了校篮球队。', 6, 6),
(57, 3, 'Our school has a big playground.', '我们学校有一个大操场。', 6, 7),
(58, 3, 'The exam will start next Monday morning.', '考试将于下周一开始。', 7, 8),
(59, 3, 'He is preparing for the entrance exam.', '他正在准备入学考试。', 7, 9),
(60, 3, 'Reading English aloud helps improve pronunciation.', '大声朗读英语有助于改善发音。', 6, 10),
(61, 3, 'I take notes carefully during every lecture.', '我每节课都认真记笔记。', 7, 11),
(62, 3, 'My classmates are friendly and helpful.', '我的同学们友好又乐于助人。', 6, 12),
(63, 3, 'We often practice speaking after class.', '我们经常在课后练习口语。', 6, 13),
(64, 3, 'The teacher explained the grammar point twice.', '老师把这个语法点讲了两遍。', 7, 14),
(65, 3, 'I borrowed three books from the library.', '我从图书馆借了三本书。', 7, 15),
(66, 3, 'She is good at math and physics.', '她擅长数学和物理。', 7, 16),
(67, 3, 'Our class won the singing competition.', '我们班赢得了歌唱比赛。', 6, 17),
(68, 3, 'You should review your lessons every day.', '你应该每天复习功课。', 7, 18),
(69, 3, 'The school canteen serves cheap and delicious food.', '学校食堂提供便宜又好吃的食物。', 8, 19),
(70, 3, 'I made a study plan for this term.', '我为这个学期制定了学习计划。', 8, 20),
(71, 3, 'He missed the class because he was ill.', '他因为生病缺课了。', 8, 21),
(72, 3, 'Writing a diary in English is useful.', '用英语写日记很有用。', 7, 22),
(73, 3, 'We discussed the question in small groups.', '我们分小组讨论了这个问题。', 7, 23),
(74, 3, 'My vocabulary has improved a lot recently.', '最近我的词汇量提高了很多。', 7, 24),
(75, 3, 'The final exam is only two weeks away.', '期末考试只剩两周了。', 8, 25);

-- 第 4 关：社会话题（25 句）
INSERT INTO t_listen_sentence (id, level_id, english, chinese, word_count, sort_no) VALUES
(76, 4, 'More and more people choose to study online.', '越来越多的人选择在线学习。', 8, 1),
(77, 4, 'The Internet has changed the way we live.', '互联网改变了我们的生活方式。', 8, 2),
(78, 4, 'Protecting the environment is everyone''s responsibility.', '保护环境是每个人的责任。', 6, 3),
(79, 4, 'Many young people prefer to work in big cities.', '许多年轻人更愿意在大城市工作。', 9, 4),
(80, 4, 'Reading books can broaden our horizons.', '读书可以开阔我们的视野。', 6, 5),
(81, 4, 'We should pay more attention to mental health.', '我们应该更多地关注心理健康。', 8, 6),
(82, 4, 'The government has built many new roads.', '政府修建了许多新道路。', 7, 7),
(83, 4, 'Learning a foreign language takes time and patience.', '学习一门外语需要时间和耐心。', 8, 8),
(84, 4, 'Air pollution is a serious problem in many cities.', '空气污染在许多城市是个严重问题。', 9, 9),
(85, 4, 'People are paying more attention to healthy eating.', '人们越来越关注健康饮食。', 8, 10),
(86, 4, 'Technology makes our daily life much more convenient.', '科技让我们的日常生活方便多了。', 8, 11),
(87, 4, 'Many students take part-time jobs during the holidays.', '许多学生在假期做兼职。', 9, 12),
(88, 4, 'Exercise is a good way to reduce stress.', '锻炼是减轻压力的好方法。', 8, 13),
(89, 4, 'The number of private cars keeps growing.', '私家车的数量持续增长。', 7, 14),
(90, 4, 'We should learn to manage our time wisely.', '我们应该学会明智地管理时间。', 8, 15),
(91, 4, 'Online shopping has become part of daily life.', '网上购物已成为日常生活的一部分。', 8, 16),
(92, 4, 'Volunteering helps us understand the real world.', '志愿服务帮助我们了解真实世界。', 7, 17),
(93, 4, 'Some people think money is the key to happiness.', '有些人认为金钱是幸福的关键。', 9, 18),
(94, 4, 'The city is becoming more crowded than before.', '这座城市比以前更拥挤了。', 8, 19),
(95, 4, 'Good communication skills are important in teamwork.', '良好的沟通能力在团队合作中很重要。', 7, 20),
(96, 4, 'Many families are moving to the countryside.', '许多家庭正在搬到乡下。', 7, 21),
(97, 4, 'We must stop wasting water and electricity.', '我们必须停止浪费水和电。', 7, 22),
(98, 4, 'Children spend too much time on mobile phones.', '孩子们在手机上花了太多时间。', 8, 23),
(99, 4, 'Education is the best investment for the future.', '教育是对未来最好的投资。', 8, 24),
(100, 4, 'Sharing ideas with others can solve problems faster.', '与他人分享想法可以更快地解决问题。', 8, 25);

-- 第 5 关：观点表达（25 句）
INSERT INTO t_listen_sentence (id, level_id, english, chinese, word_count, sort_no) VALUES
(101, 5, 'In my opinion, students should be encouraged to think independently.', '在我看来，应该鼓励学生独立思考。', 10, 1),
(102, 5, 'Although he was tired, he kept working until midnight.', '尽管他很累，他还是工作到半夜。', 9, 2),
(103, 5, 'The more you practice, the more confident you will become.', '你练得越多，就会越自信。', 10, 3),
(104, 5, 'It is important to keep a balance between work and rest.', '保持工作与休息的平衡很重要。', 11, 4),
(105, 5, 'What matters most is not talent but hard work.', '最重要的不是天赋而是努力。', 9, 5),
(106, 5, 'I believe that hard work will finally pay off.', '我相信努力最终会有回报。', 9, 6),
(107, 5, 'Nobody can succeed without making any mistakes.', '没有人能不犯任何错误就成功。', 7, 7),
(108, 5, 'We should not judge a person by his appearance.', '我们不应该以貌取人。', 9, 8),
(109, 5, 'The reason why he failed is that he gave up.', '他失败的原因是他放弃了。', 10, 9),
(110, 5, 'It is necessary for us to learn from our mistakes.', '我们有必要从错误中学习。', 10, 10),
(111, 5, 'Compared with the past, life is much better now.', '与过去相比，现在的生活好多了。', 9, 11),
(112, 5, 'As long as you keep trying, you will make progress.', '只要你不断尝试，就会取得进步。', 10, 12),
(113, 5, 'He studies so hard that he often forgets to eat.', '他学习如此努力以至于常常忘了吃饭。', 10, 13),
(114, 5, 'Before making a decision, you should think it over carefully.', '做决定之前，你应该仔细考虑。', 10, 14),
(115, 5, 'The problem is that we do not have enough time.', '问题是我们没有足够的时间。', 10, 15),
(116, 5, 'I would rather walk than take a crowded bus.', '我宁愿走路也不愿坐拥挤的公交车。', 9, 16),
(117, 5, 'No matter how difficult it is, I will not give up.', '无论多难，我都不会放弃。', 11, 17),
(118, 5, 'It took me three years to master this skill.', '我花了三年时间才掌握这项技能。', 9, 18),
(119, 5, 'The book is so interesting that I read it twice.', '这本书太有趣了以至于我读了两遍。', 10, 19),
(120, 5, 'We are supposed to finish the task before Friday.', '我们应该在周五之前完成这项任务。', 9, 20),
(121, 5, 'There is no doubt that reading improves our thinking.', '毫无疑问，阅读能改善我们的思维。', 9, 21),
(122, 5, 'He was too excited to say a single word.', '他太激动了，一个字都说不出来。', 9, 22),
(123, 5, 'The earlier you start, the more chances you will have.', '你开始得越早，机会就越多。', 10, 23),
(124, 5, 'What he said made all of us think deeply.', '他说的话让我们所有人都深思。', 9, 24),
(125, 5, 'As far as I am concerned, honesty comes first.', '就我而言，诚实最重要。', 9, 25);

-- 第 6 关：长句挑战（25 句）
INSERT INTO t_listen_sentence (id, level_id, english, chinese, word_count, sort_no) VALUES
(126, 6, 'Many students find it difficult to balance study, part-time jobs and social activities.', '很多学生觉得很难平衡学习、兼职和社交活动。', 14, 1),
(127, 6, 'With the rapid development of technology, our way of learning has changed greatly.', '随着科技的快速发展，我们的学习方式发生了巨大变化。', 13, 2),
(128, 6, 'If you want to improve your English, you must practice listening and speaking every day.', '如果你想提高英语，就必须每天练习听力和口语。', 15, 3),
(129, 6, 'The teacher suggested that we should read at least one English article every day.', '老师建议我们每天至少读一篇英语文章。', 14, 4),
(130, 6, 'People who exercise regularly are usually healthier and more energetic than those who do not.', '经常锻炼的人通常比不锻炼的人更健康、更有活力。', 15, 5),
(131, 6, 'Although online learning is convenient, it still cannot completely replace traditional classrooms.', '虽然在线学习很方便，但它仍然无法完全取代传统课堂。', 12, 6),
(132, 6, 'The most important thing is that we should never stop learning new things.', '最重要的是我们永远不应该停止学习新事物。', 13, 7),
(133, 6, 'Parents should encourage their children to solve problems by themselves instead of helping too much.', '父母应该鼓励孩子自己解决问题，而不是过度帮助。', 15, 8),
(134, 6, 'It is reported that more than half of the students have part-time work experience.', '据报道，超过一半的学生有兼职工作经验。', 15, 9),
(135, 6, 'In order to achieve your goal, you need a clear plan and strong self-control.', '为了实现目标，你需要清晰的计划和强大的自控力。', 15, 10),
(136, 6, 'The environment we live in today is much worse than it was twenty years ago.', '我们今天所生活的环境比二十年前糟糕得多。', 15, 11),
(137, 6, 'Whenever I meet difficulties in my study, I always ask my teachers for help.', '每当我在学习中遇到困难，我总是向老师求助。', 14, 12),
(138, 6, 'What we need is not only knowledge, but also the ability to use it.', '我们需要的不仅是知识，还有运用知识的能力。', 14, 13),
(139, 6, 'Reading widely can help you build a larger vocabulary and understand different cultures.', '广泛阅读能帮你积累更大的词汇量并理解不同文化。', 13, 14),
(140, 6, 'Many people believe that a good education is the surest way to a better life.', '许多人相信良好的教育是通往更好生活最可靠的途径。', 15, 15),
(141, 6, 'The company decided to offer more training programs for its new employees.', '公司决定为新员工提供更多培训项目。', 12, 16),
(142, 6, 'Even though it was raining heavily, they continued to work in the field.', '尽管雨下得很大，他们仍继续在田里干活。', 13, 17),
(143, 6, 'It is a good idea to review what you have learned before going to bed.', '睡前复习所学的内容是个好主意。', 15, 18),
(144, 6, 'Young people today face more pressure than their parents did at the same age.', '今天的年轻人比他们父母在同龄时面临更大的压力。', 14, 19),
(145, 6, 'The more carefully you listen, the more details you will be able to catch.', '你听得越仔细，能抓住的细节就越多。', 14, 20),
(146, 6, 'We should try our best to protect the earth for future generations.', '我们应该尽最大努力为后代保护地球。', 12, 21),
(147, 6, 'He explained the problem so clearly that everyone understood it immediately.', '他把问题解释得如此清楚，以至于每个人都立刻明白了。', 11, 22),
(148, 6, 'There are many ways to improve your English, but none of them works without practice.', '提高英语的方法有很多，但没有练习哪种都不行。', 15, 23),
(149, 6, 'A person who keeps learning throughout his life will never fall behind the times.', '一个终身学习的人永远不会落后于时代。', 14, 24),
(150, 6, 'The success of a team depends on how well its members work together.', '一个团队的成功取决于成员之间配合得有多好。', 13, 25);

-- ---------- 每日任务：新增听力听写任务 ----------
INSERT INTO t_daily_task (code, title, task_type, target_value, reward_points, sort_no, status) VALUES ('DAILY_LISTEN', '完成 1 次听力听写', 'LISTEN_COUNT', 1, 10, 4, 1)
ON DUPLICATE KEY UPDATE title = VALUES(title), task_type = VALUES(task_type), target_value = VALUES(target_value), reward_points = VALUES(reward_points), status = 1;
