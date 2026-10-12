package com.cc.englishquest.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cc.englishquest.common.BizException;
import com.cc.englishquest.common.PointType;
import com.cc.englishquest.dto.ListenCheckDTO;
import com.cc.englishquest.dto.ListenSubmitDTO;
import com.cc.englishquest.entity.ListenLevel;
import com.cc.englishquest.entity.ListenSentence;
import com.cc.englishquest.entity.StudyRecord;
import com.cc.englishquest.entity.UserLesson;
import com.cc.englishquest.mapper.ListenLevelMapper;
import com.cc.englishquest.mapper.ListenSentenceMapper;
import com.cc.englishquest.mapper.StudyRecordMapper;
import com.cc.englishquest.mapper.UserLessonMapper;
import com.cc.englishquest.vo.ListenCheckVO;
import com.cc.englishquest.vo.ListenLevelVO;
import com.cc.englishquest.vo.ListenResultVO;
import com.cc.englishquest.vo.ListenSentenceVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

/**
 * 听力听写服务
 *
 * 训练形式：听英文音频 → 用键盘敲出整句 → 逐词比对判分。
 * 两种模式：
 *   EASY 简单 —— 下发每个单词的字母数，前端画成长度提示块
 *   HARD 困难 —— 不下发任何长度信息，只有一条整体输入线
 *
 * 反作弊：练习阶段下发的 {@link ListenSentenceVO} 永远不含英文原句；
 * 困难模式连 wordCount / wordLens 都不下发，答案无法从网络响应反推。
 *
 * 关卡解锁：6 个关卡按 sortNo 逐关解锁，第 1 关默认开放，
 * 第 N 关需第 N-1 关成绩达到及格分；进度统一记录在 t_user_lesson
 * （module = LISTENING），与词汇、语法闯关共用同一张进度表。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ListenService {

    public static final String MODULE = "LISTENING";

    public static final String MODE_EASY = "EASY";
    public static final String MODE_HARD = "HARD";

    /** 每答对一句的积分：困难模式给更高的回报 */
    private static final int POINT_PER_CORRECT_EASY = 2;
    private static final int POINT_PER_CORRECT_HARD = 3;

    /** 满分线（单句按 10 分制） */
    private static final int FULL_ACCURACY = 100;

    private final ListenLevelMapper levelMapper;
    private final ListenSentenceMapper sentenceMapper;
    private final UserLessonMapper userLessonMapper;
    private final StudyRecordMapper studyRecordMapper;
    private final PointService pointService;
    private final ErrorBookService errorBookService;
    private final TaskService taskService;

    /* ============================================================
       一、关卡地图
       ============================================================ */

    public List<ListenLevelVO> listLevels(Long userId) {
        List<ListenLevel> levels = levelMapper.selectList(new LambdaQueryWrapper<ListenLevel>()
                .eq(ListenLevel::getStatus, 1)
                .orderByAsc(ListenLevel::getSortNo));

        Map<Long, UserLesson> progressMap = new HashMap<>();
        for (UserLesson ul : userLessonMapper.selectList(new LambdaQueryWrapper<UserLesson>()
                .eq(UserLesson::getUserId, userId)
                .eq(UserLesson::getModule, MODULE))) {
            progressMap.put(ul.getLessonId(), ul);
        }

        List<ListenLevelVO> result = new ArrayList<>();
        // 逐关解锁：第 1 关默认开放，之后每关要求「上一关已通过」
        boolean prevPassed = true;
        for (ListenLevel level : levels) {
            UserLesson progress = progressMap.get(level.getId());
            ListenLevelVO vo = new ListenLevelVO();
            vo.setId(level.getId());
            vo.setName(level.getName());
            vo.setDifficulty(level.getDifficulty());
            vo.setDescription(level.getDescription());
            vo.setQuestionCount(level.getQuestionCount());
            vo.setPassScore(level.getPassScore());
            vo.setSortNo(level.getSortNo());
            boolean passed = progress != null && progress.getScore() >= level.getPassScore();
            vo.setPassed(passed);
            // 已通过的关卡永久开放，避免历史进度被锁死
            vo.setLocked(!prevPassed && !passed);
            vo.setBestScore(progress == null ? 0 : progress.getScore());
            vo.setBankSize(Math.toIntExact(sentenceMapper.selectCount(
                    new LambdaQueryWrapper<ListenSentence>()
                            .eq(ListenSentence::getLevelId, level.getId())
                            .eq(ListenSentence::getStatus, 1))));
            result.add(vo);
            prevPassed = passed;
        }
        return result;
    }

    /* ============================================================
       二、开始练习（抽句 + 按模式下发提示）
       ============================================================ */

    public Map<String, Object> start(Long userId, Long levelId, String mode, Integer count) {
        // 逐关解锁：关卡未解锁直接拒绝，避免绕过前端直接请求
        ListenLevel level = requireUnlocked(userId, levelId);
        String m = normalizeMode(mode);
        boolean easy = MODE_EASY.equals(m);
        int limit = count == null || count <= 0 ? level.getQuestionCount() : count;

        List<ListenSentence> sentences = sentenceMapper.selectList(
                new LambdaQueryWrapper<ListenSentence>()
                        .eq(ListenSentence::getLevelId, levelId)
                        .eq(ListenSentence::getStatus, 1)
                        .last("ORDER BY RAND() LIMIT " + limit));
        if (sentences.isEmpty()) {
            throw BizException.badRequest("该关卡暂无听力语料，请联系管理员");
        }

        List<ListenSentenceVO> list = new ArrayList<>();
        for (ListenSentence s : sentences) {
            ListenSentenceVO vo = new ListenSentenceVO();
            vo.setId(s.getId());
            vo.setChinese(s.getChinese());
            if (easy) {
                // 简单模式：只下发「每词几个字母」，不下发单词本身
                String[] ws = words(s.getEnglish());
                vo.setWordCount(ws.length);
                List<Integer> lens = new ArrayList<>(ws.length);
                for (String w : ws) {
                    lens.add(w.length());
                }
                vo.setWordLens(lens);
            }
            // 困难模式：wordCount / wordLens 全部为 null
            list.add(vo);
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("levelId", level.getId());
        data.put("levelName", level.getName());
        data.put("mode", m);
        data.put("passScore", level.getPassScore());
        data.put("sentences", list);
        return data;
    }

    /* ============================================================
       三、单句判分（即时反馈，不落库）
       ============================================================ */

    public ListenCheckVO check(Long userId, ListenCheckDTO dto) {
        ListenSentence sentence = sentenceMapper.selectById(dto.getSentenceId());
        if (sentence == null) {
            throw BizException.badRequest("句子不存在");
        }
        String userAnswer = dto.getUserAnswer() == null ? "" : dto.getUserAnswer();
        return buildCheck(sentence, userAnswer, false);
    }

    /* ============================================================
       四、关卡提交结算
       ============================================================ */

    @Transactional(rollbackFor = Exception.class)
    public ListenResultVO submit(Long userId, Long levelId, ListenSubmitDTO dto) {
        ListenLevel level = requireUnlocked(userId, levelId);
        String mode = normalizeMode(dto.getMode());
        boolean hard = MODE_HARD.equals(mode);

        List<ListenSubmitDTO.AnswerItem> answers = dto.getAnswers();
        if (answers == null || answers.isEmpty()) {
            throw BizException.badRequest("答题内容不能为空");
        }

        List<Long> ids = new ArrayList<>();
        for (ListenSubmitDTO.AnswerItem a : answers) {
            if (a.getSentenceId() != null) {
                ids.add(a.getSentenceId());
            }
        }
        if (ids.isEmpty()) {
            throw BizException.badRequest("答题内容不能为空");
        }

        // 服务端重新取回原句判分，不信任前端上报的分数
        List<ListenSentence> sentences = sentenceMapper.selectList(
                new LambdaQueryWrapper<ListenSentence>()
                        .in(ListenSentence::getId, ids)
                        .eq(ListenSentence::getLevelId, levelId));
        Map<Long, ListenSentence> sentenceMap = new HashMap<>();
        sentences.forEach(s -> sentenceMap.put(s.getId(), s));
        if (sentenceMap.isEmpty()) {
            throw BizException.badRequest("句子不存在或不属于该关卡");
        }

        int correctCount = 0;
        double accuracySum = 0;
        int total = 0;
        List<ListenResultVO.ItemVO> details = new ArrayList<>();

        for (ListenSubmitDTO.AnswerItem item : answers) {
            ListenSentence s = sentenceMap.get(item.getSentenceId());
            if (s == null) {
                continue;
            }
            total++;
            boolean revealed = Boolean.TRUE.equals(item.getRevealed());
            String rawAnswer = item.getUserAnswer() == null ? "" : item.getUserAnswer();
            // 查看过答案的题目不计分
            String userAnswer = revealed ? "" : rawAnswer;

            ListenCheckVO checked = buildCheck(s, userAnswer, revealed);
            accuracySum += checked.getAccuracy();
            if (Boolean.TRUE.equals(checked.getCorrect())) {
                correctCount++;
            }

            // 答题记录
            StudyRecord record = new StudyRecord();
            record.setUserId(userId);
            record.setModule(MODULE);
            record.setTargetId(levelId);
            record.setQuestionId(s.getId());
            record.setUserAnswer(userAnswer);
            record.setCorrectAnswer(s.getEnglish());
            record.setIsCorrect(checked.getCorrect() ? 1 : 0);
            record.setCostTime(dto.getCostTime());
            record.setCreateTime(LocalDateTime.now());
            studyRecordMapper.insert(record);

            // 未答对则收录错题本
            if (!Boolean.TRUE.equals(checked.getCorrect())) {
                // 解析里带上逐词差异，错题本不必再自己算一遍
                String analysis = String.format("词级匹配 %d/%d，准确率 %d%%",
                        checked.getMatchedCount(), checked.getTotalWords(),
                        Math.round(checked.getAccuracy() * 100));
                String diff = diffWords(s.getEnglish(), rawAnswer);
                if (!diff.isEmpty()) {
                    analysis = analysis + "。" + diff;
                }
                errorBookService.record(userId, MODULE, s.getId(), level.getName(),
                        s.getChinese(), s.getEnglish(), rawAnswer, analysis);
            }

            ListenResultVO.ItemVO detail = new ListenResultVO.ItemVO();
            detail.setSentenceId(s.getId());
            detail.setEnglish(s.getEnglish());
            detail.setChinese(s.getChinese());
            detail.setUserAnswer(rawAnswer);
            detail.setRevealed(revealed);
            detail.setAccuracy(checked.getAccuracy());
            detail.setCorrect(checked.getCorrect());
            detail.setMatchedCount(checked.getMatchedCount());
            detail.setTotalWords(checked.getTotalWords());
            detail.setScore(checked.getScore());
            details.add(detail);
        }

        if (total == 0) {
            throw BizException.badRequest("答题内容不能为空");
        }

        double avgAccuracy = accuracySum / total;
        int score = (int) Math.round(avgAccuracy * 100);
        int stars = score >= FULL_ACCURACY ? 3 : score >= 80 ? 2 : score >= 60 ? 1 : 0;
        boolean passed = score >= level.getPassScore();
        boolean fullScore = score >= FULL_ACCURACY;

        // ---------- 关卡进度（保留最高分） ----------
        UserLesson progress = userLessonMapper.selectOne(new LambdaQueryWrapper<UserLesson>()
                .eq(UserLesson::getUserId, userId)
                .eq(UserLesson::getModule, MODULE)
                .eq(UserLesson::getLessonId, levelId));
        boolean newRecord = progress == null || score > progress.getScore();
        if (progress == null) {
            progress = new UserLesson();
            progress.setUserId(userId);
            progress.setLessonId(levelId);
            progress.setModule(MODULE);
            progress.setScore(score);
            progress.setPassScore(level.getPassScore());
            progress.setStars(stars);
            progress.setCorrectCnt(correctCount);
            progress.setTotalCnt(total);
            progress.setStatus(passed ? (fullScore ? "MASTERED" : "PASSED") : "UNLOCKED");
            progress.setFinishTime(LocalDateTime.now());
            progress.setCreateTime(LocalDateTime.now());
            userLessonMapper.insert(progress);
        } else if (newRecord) {
            progress.setScore(score);
            progress.setStars(stars);
            progress.setCorrectCnt(correctCount);
            progress.setTotalCnt(total);
            progress.setStatus(passed ? (fullScore ? "MASTERED" : "PASSED") : progress.getStatus());
            progress.setFinishTime(LocalDateTime.now());
            userLessonMapper.updateById(progress);
        }

        // ---------- 积分结算 ----------
        String today = LocalDate.now().toString();
        int perCorrect = hard ? POINT_PER_CORRECT_HARD : POINT_PER_CORRECT_EASY;
        int gain = 0;
        if (correctCount > 0) {
            gain += pointService.addPoints(userId, correctCount * perCorrect, PointType.ANSWER,
                    "ans-" + MODULE + "-" + mode + "-" + levelId + "-" + today,
                    "听力听写答对 " + correctCount + " 句");
        }
        if (passed) {
            gain += pointService.addPoints(userId, pointService.getLevelPoint(), PointType.LEVEL,
                    "level-" + MODULE + "-" + mode + "-" + levelId,
                    "完成听力关卡：" + level.getName());
            if (fullScore) {
                gain += pointService.addPoints(userId, pointService.getFullScorePoint(),
                        PointType.FULL_SCORE, "full-" + MODULE + "-" + mode + "-" + levelId,
                        "听力关卡满分：" + level.getName());
            }
            // 完成关卡即打卡
            pointService.checkin(userId);
        }

        // ---------- 每日任务进度 ----------
        taskService.addProgress(userId, TaskService.TYPE_LISTEN_COUNT, 1);
        taskService.addProgress(userId, TaskService.TYPE_CORRECT_COUNT, correctCount);
        if (passed) {
            taskService.addProgress(userId, TaskService.TYPE_LEVEL_COUNT, 1);
        }

        ListenResultVO vo = new ListenResultVO();
        vo.setLevelId(level.getId());
        vo.setLevelName(level.getName());
        vo.setMode(mode);
        vo.setScore(score);
        vo.setPassScore(level.getPassScore());
        vo.setPassed(passed);
        vo.setUnlockNext(passed && hasNextLevel(level));
        vo.setCorrectCount(correctCount);
        vo.setTotalCount(total);
        vo.setAvgAccuracy(Math.round(avgAccuracy * 1000) / 1000.0);
        vo.setStars(stars);
        vo.setGainPoints(gain);
        vo.setNewRecord(newRecord);
        vo.setDetails(details);
        return vo;
    }

    /* ============================================================
       五、判分内核
       ============================================================ */

    private ListenCheckVO buildCheck(ListenSentence sentence, String userAnswer, boolean revealed) {
        String[] correctWords = words(sentence.getEnglish());
        String[] userWords = words(userAnswer);
        boolean[] correctMatched = new boolean[correctWords.length];
        boolean[] userMatched = new boolean[userWords.length];
        int matched = matchCount(correctWords, userWords, correctMatched, userMatched);

        int totalWords = correctWords.length;
        double accuracy = totalWords == 0 ? 0 : (double) matched / totalWords;
        // 完全正确 = 逐词全对 且 没有多敲的词
        boolean correct = !revealed && totalWords > 0
                && matched == totalWords && userWords.length == totalWords;
        int score = revealed ? 0 : (int) Math.round(accuracy * 10);

        ListenCheckVO vo = new ListenCheckVO();
        vo.setSentenceId(sentence.getId());
        vo.setCorrect(correct);
        vo.setAccuracy(Math.round(accuracy * 1000) / 1000.0);
        vo.setMatchedCount(matched);
        vo.setTotalWords(totalWords);
        vo.setScore(score);
        vo.setCorrectAnswer(sentence.getEnglish());
        vo.setChinese(sentence.getChinese());
        vo.setUserWords(toWordVOs(userWords, userMatched));
        vo.setAnswerWords(toWordVOs(correctWords, correctMatched));
        return vo;
    }

    /**
     * 逐词比对：最长公共子序列（LCS）
     *
     * 用 LCS 而不是按下标硬比，是因为听写时漏掉一个词很常见，
     * 按下标比会导致「漏一个词 → 后面全判错」，反馈会非常打击人。
     */
    private static int matchCount(String[] c, String[] u, boolean[] cm, boolean[] um) {
        int n = c.length;
        int m = u.length;
        if (n == 0 || m == 0) {
            return 0;
        }
        int[][] dp = new int[n + 1][m + 1];
        for (int i = 1; i <= n; i++) {
            for (int j = 1; j <= m; j++) {
                dp[i][j] = c[i - 1].equals(u[j - 1])
                        ? dp[i - 1][j - 1] + 1
                        : Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
        // 回溯出对齐关系，供前端逐词红绿着色
        int i = n;
        int j = m;
        while (i > 0 && j > 0) {
            if (c[i - 1].equals(u[j - 1])) {
                cm[i - 1] = true;
                um[j - 1] = true;
                i--;
                j--;
            } else if (dp[i - 1][j] >= dp[i][j - 1]) {
                i--;
            } else {
                j--;
            }
        }
        int matched = 0;
        for (boolean b : cm) {
            if (b) {
                matched++;
            }
        }
        return matched;
    }

    private static List<ListenCheckVO.WordVO> toWordVOs(String[] ws, boolean[] matched) {
        List<ListenCheckVO.WordVO> list = new ArrayList<>(ws.length);
        for (int i = 0; i < ws.length; i++) {
            list.add(new ListenCheckVO.WordVO(ws[i], matched[i]));
        }
        return list;
    }

    /** 归一化：小写、去撇号、标点转空格、压缩多余空白 */
    public static String normalize(String s) {
        if (s == null) {
            return "";
        }
        return s.toLowerCase()
                .replace("’", "")
                .replace("'", "")
                .replaceAll("[^a-z0-9\\s]", " ")
                .replaceAll("\\s+", " ")
                .trim();
    }

    public static String[] words(String s) {
        String n = normalize(s);
        return n.isEmpty() ? new String[0] : n.split(" ");
    }

    /**
     * 词级准确率：匹配上的词数 / 正确答案词数
     *
     * 供错题本重练等场景复用，避免「少敲一个词就判全错」。
     */
    public static double accuracy(String correctText, String userText) {
        String[] c = words(correctText);
        if (c.length == 0) {
            return 0;
        }
        String[] u = words(userText);
        return (double) matchCount(c, u, new boolean[c.length], new boolean[u.length]) / c.length;
    }

    /**
     * 逐词差异描述：说清「漏了哪些词、多了哪些词」，供错题讲解使用。
     *
     * <p>这是听力模块相比选项题最大的优势 —— LCS 对齐后能精确定位到出错的那个词，
     * 而不是笼统地说"听错了"。返回的字符串直接可读，例如
     * 「漏掉的词：the、was；多敲的词：a」。</p>
     *
     * @return 差异描述；完全一致时返回空串
     */
    public static String diffWords(String correctText, String userText) {
        String[] c = words(correctText);
        String[] u = words(userText);
        boolean[] cm = new boolean[c.length];
        boolean[] um = new boolean[u.length];
        matchCount(c, u, cm, um);

        List<String> missed = new ArrayList<>();
        for (int i = 0; i < c.length; i++) {
            if (!cm[i]) {
                missed.add(c[i]);
            }
        }
        List<String> extra = new ArrayList<>();
        for (int j = 0; j < u.length; j++) {
            if (!um[j]) {
                extra.add(u[j]);
            }
        }
        if (missed.isEmpty() && extra.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        if (!missed.isEmpty()) {
            sb.append("漏掉或听错的词：").append(String.join("、", missed));
        }
        if (!extra.isEmpty()) {
            if (sb.length() > 0) {
                sb.append("；");
            }
            sb.append("多敲的词：").append(String.join("、", extra));
        }
        return sb.toString();
    }

    /* ============================================================
       六、工具
       ============================================================ */

    private ListenLevel requireLevel(Long levelId) {
        ListenLevel level = levelMapper.selectById(levelId);
        if (level == null || level.getStatus() == 0) {
            throw BizException.badRequest("听力关卡不存在");
        }
        return level;
    }

    /**
     * 逐关解锁判定：按 sortNo 找出本关的前一关，
     * 前一关没有达标记录则拒绝进入；第 1 关默认开放。
     */
    private boolean canUnlock(Long userId, ListenLevel current) {
        List<ListenLevel> levels = levelMapper.selectList(new LambdaQueryWrapper<ListenLevel>()
                .eq(ListenLevel::getStatus, 1)
                .orderByAsc(ListenLevel::getSortNo));
        for (int i = 0; i < levels.size(); i++) {
            if (!levels.get(i).getId().equals(current.getId())) {
                continue;
            }
            // 已通过过的关卡永久开放
            UserLesson self = userLessonMapper.selectOne(new LambdaQueryWrapper<UserLesson>()
                    .eq(UserLesson::getUserId, userId)
                    .eq(UserLesson::getModule, MODULE)
                    .eq(UserLesson::getLessonId, current.getId()));
            if (self != null && self.getScore() >= current.getPassScore()) {
                return true;
            }
            if (i == 0) {
                return true;
            }
            ListenLevel prev = levels.get(i - 1);
            UserLesson prevProgress = userLessonMapper.selectOne(new LambdaQueryWrapper<UserLesson>()
                    .eq(UserLesson::getUserId, userId)
                    .eq(UserLesson::getModule, MODULE)
                    .eq(UserLesson::getLessonId, prev.getId()));
            return prevProgress != null && prevProgress.getScore() >= prev.getPassScore();
        }
        return true;
    }

    /** 校验关卡是否存在且已解锁 */
    private ListenLevel requireUnlocked(Long userId, Long levelId) {
        ListenLevel level = requireLevel(levelId);
        if (!canUnlock(userId, level)) {
            ListenLevel prev = previousLevel(level);
            throw BizException.badRequest(prev == null
                    ? "该听力关卡尚未解锁"
                    : "请先通过「" + prev.getName() + "」再挑战本关");
        }
        return level;
    }

    /** 按 sortNo 找前一关（不存在返回 null） */
    private ListenLevel previousLevel(ListenLevel current) {
        List<ListenLevel> levels = levelMapper.selectList(new LambdaQueryWrapper<ListenLevel>()
                .eq(ListenLevel::getStatus, 1)
                .orderByAsc(ListenLevel::getSortNo));
        ListenLevel prev = null;
        for (ListenLevel l : levels) {
            if (l.getId().equals(current.getId())) {
                return prev;
            }
            prev = l;
        }
        return null;
    }

    private boolean hasNextLevel(ListenLevel current) {
        Long count = levelMapper.selectCount(new LambdaQueryWrapper<ListenLevel>()
                .eq(ListenLevel::getStatus, 1)
                .gt(ListenLevel::getSortNo, current.getSortNo()));
        return count != null && count > 0;
    }

    private String normalizeMode(String mode) {
        return MODE_HARD.equalsIgnoreCase(mode) ? MODE_HARD : MODE_EASY;
    }
}
