package com.cc.englishquest.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cc.englishquest.common.BizException;
import com.cc.englishquest.common.PointType;
import com.cc.englishquest.entity.StudyRecord;
import com.cc.englishquest.entity.UserLesson;
import com.cc.englishquest.entity.VocabLevel;
import com.cc.englishquest.entity.VocabQuestion;
import com.cc.englishquest.dto.SubmitDTO;
import com.cc.englishquest.mapper.StudyRecordMapper;
import com.cc.englishquest.mapper.UserLessonMapper;
import com.cc.englishquest.mapper.VocabLevelMapper;
import com.cc.englishquest.mapper.VocabQuestionMapper;
import com.cc.englishquest.vo.LevelVO;
import com.cc.englishquest.vo.QuestionVO;
import com.cc.englishquest.vo.SubmitResultVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

/**
 * 词汇闯关服务：关卡地图、抽题、判分、结算
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class VocabService {

    public static final String MODULE = "VOCAB";

    private final VocabLevelMapper levelMapper;
    private final VocabQuestionMapper questionMapper;
    private final UserLessonMapper userLessonMapper;
    private final StudyRecordMapper studyRecordMapper;
    private final PointService pointService;
    private final ErrorBookService errorBookService;
    private final TaskService taskService;

    /** 关卡地图（含解锁状态与进度） */
    public List<LevelVO> listLevels(Long userId) {
        List<VocabLevel> levels = levelMapper.selectList(new LambdaQueryWrapper<VocabLevel>()
                .eq(VocabLevel::getStatus, 1)
                .orderByAsc(VocabLevel::getSortNo));
        Map<Long, UserLesson> progressMap = new HashMap<>();
        for (UserLesson ul : userLessonMapper.selectList(new LambdaQueryWrapper<UserLesson>()
                .eq(UserLesson::getUserId, userId)
                .eq(UserLesson::getModule, MODULE))) {
            progressMap.put(ul.getLessonId(), ul);
        }

        List<LevelVO> result = new ArrayList<>();
        boolean prevPassed = true;
        for (VocabLevel level : levels) {
            UserLesson progress = progressMap.get(level.getId());
            LevelVO vo = new LevelVO();
            vo.setId(level.getId());
            vo.setName(level.getName());
            vo.setDifficulty(level.getDifficulty());
            vo.setDescription(level.getDescription());
            vo.setQuestionCount(level.getQuestionCount());
            vo.setPassScore(level.getPassScore());
            vo.setSortNo(level.getSortNo());
            vo.setLocked(!prevPassed);
            vo.setPassed(progress != null && progress.getScore() >= level.getPassScore());
            vo.setBestScore(progress == null ? 0 : progress.getScore());
            vo.setStars(progress == null ? 0 : progress.getStars());
            vo.setBankSize(Math.toIntExact(questionMapper.selectCount(new LambdaQueryWrapper<VocabQuestion>()
                    .eq(VocabQuestion::getLevelId, level.getId())
                    .eq(VocabQuestion::getStatus, 1))));
            result.add(vo);
            prevPassed = vo.getPassed();
        }
        return result;
    }

    /** 抽题（不下发答案） */
    public List<QuestionVO> getQuestions(Long userId, Long levelId) {
        VocabLevel level = requireUnlocked(userId, levelId);
        int count = level.getQuestionCount() == null ? 10 : level.getQuestionCount();
        List<VocabQuestion> questions = questionMapper.selectList(new LambdaQueryWrapper<VocabQuestion>()
                .eq(VocabQuestion::getLevelId, levelId)
                .eq(VocabQuestion::getStatus, 1)
                .last("ORDER BY RAND() LIMIT " + count));
        if (questions.isEmpty()) {
            throw BizException.badRequest("该关卡暂无题目，请联系管理员");
        }

        List<QuestionVO> result = new ArrayList<>();
        for (VocabQuestion q : questions) {
            QuestionVO vo = new QuestionVO();
            vo.setId(q.getId());
            vo.setType(q.getType());
            if ("CHOICE".equals(q.getType())) {
                // 英译中：题干为单词，选项为释义
                vo.setStem(q.getWord());
                vo.setPhonetic(q.getPhonetic());
                vo.setOptionList(Arrays.asList(
                        new QuestionVO.OptionVO("A", q.getOptionA()),
                        new QuestionVO.OptionVO("B", q.getOptionB()),
                        new QuestionVO.OptionVO("C", q.getOptionC()),
                        new QuestionVO.OptionVO("D", q.getOptionD())));
                vo.setOptions(Arrays.asList(q.getOptionA(), q.getOptionB(), q.getOptionC(), q.getOptionD()));
            } else {
                // 中译英拼写：题干为释义
                vo.setStem(q.getMeaning());
                vo.setHint(q.getPhonetic());
                vo.setOptions(Collections.emptyList());
            }
            result.add(vo);
        }
        return result;
    }

    /** 提交判分 */
    @Transactional(rollbackFor = Exception.class)
    public SubmitResultVO submit(Long userId, Long levelId, SubmitDTO dto) {
        VocabLevel level = requireUnlocked(userId, levelId);
        List<Long> questionIds = dto.getAnswers().stream()
                .map(SubmitDTO.AnswerItem::getQuestionId).toList();
        if (questionIds.isEmpty()) {
            throw BizException.badRequest("答题内容不能为空");
        }

        List<VocabQuestion> questions = questionMapper.selectList(new LambdaQueryWrapper<VocabQuestion>()
                .in(VocabQuestion::getId, questionIds)
                .eq(VocabQuestion::getLevelId, levelId));
        if (questions.isEmpty()) {
            throw BizException.badRequest("题目不存在或不属于该关卡");
        }
        Map<Long, VocabQuestion> questionMap = new HashMap<>();
        questions.forEach(q -> questionMap.put(q.getId(), q));

        int correctCount = 0;
        List<SubmitResultVO.WrongItem> wrongItems = new ArrayList<>();
        for (SubmitDTO.AnswerItem item : dto.getAnswers()) {
            VocabQuestion q = questionMap.get(item.getQuestionId());
            if (q == null) {
                continue;
            }
            String userAnswer = item.getUserAnswer() == null ? "" : item.getUserAnswer();
            boolean correct = normalize(q.getAnswer()).equalsIgnoreCase(normalize(userAnswer));

            StudyRecord record = new StudyRecord();
            record.setUserId(userId);
            record.setModule(MODULE);
            record.setTargetId(levelId);
            record.setQuestionId(q.getId());
            record.setUserAnswer(userAnswer);
            record.setCorrectAnswer(q.getAnswer());
            record.setIsCorrect(correct ? 1 : 0);
            record.setCostTime(dto.getCostTime());
            record.setCreateTime(LocalDateTime.now());
            studyRecordMapper.insert(record);

            if (correct) {
                correctCount++;
            } else {
                // 收录错题
                errorBookService.record(userId, MODULE, q.getId(),
                        q.getWord(), q.getWord() + "（" + q.getMeaning() + "）",
                        q.getAnswer(), userAnswer, q.getAnalysis());
                SubmitResultVO.WrongItem wrong = new SubmitResultVO.WrongItem();
                wrong.setQuestionId(q.getId());
                wrong.setStem(q.getWord() + "（" + q.getMeaning() + "）");
                wrong.setUserAnswer(userAnswer);
                wrong.setCorrectAnswer(q.getAnswer());
                wrong.setAnalysis(q.getAnalysis());
                wrongItems.add(wrong);
            }
        }

        int total = dto.getAnswers().size();
        int score = (int) Math.round(correctCount * 100.0 / total);
        int stars = score >= 100 ? 3 : score >= 80 ? 2 : score >= 60 ? 1 : 0;
        boolean passed = score >= level.getPassScore();

        // 更新关卡进度（保留最高分）
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
            progress.setStatus(passed ? (score >= 100 ? "MASTERED" : "PASSED") : "UNLOCKED");
            progress.setFinishTime(LocalDateTime.now());
            progress.setCreateTime(LocalDateTime.now());
            userLessonMapper.insert(progress);
        } else if (newRecord) {
            progress.setScore(score);
            progress.setStars(stars);
            progress.setCorrectCnt(correctCount);
            progress.setTotalCnt(total);
            progress.setStatus(passed ? (score >= 100 ? "MASTERED" : "PASSED") : progress.getStatus());
            progress.setFinishTime(LocalDateTime.now());
            userLessonMapper.updateById(progress);
        }

        // ---------- 积分结算 ----------
        String today = LocalDate.now().toString();
        int gain = 0;
        // 答题积分（同一关卡每天只结算一次，防止重复刷分）
        gain += pointService.addPoints(userId, correctCount * pointService.getAnswerPoint(),
                PointType.ANSWER, "ans-" + MODULE + "-" + levelId + "-" + today, "词汇闯关答题得分");
        if (passed) {
            gain += pointService.addPoints(userId, pointService.getLevelPoint(),
                    PointType.LEVEL, "level-" + MODULE + "-" + levelId, "完成词汇关卡：" + level.getName());
            if (score >= 100) {
                gain += pointService.addPoints(userId, pointService.getFullScorePoint(),
                        PointType.FULL_SCORE, "full-" + MODULE + "-" + levelId, "词汇关卡满分：" + level.getName());
            }
            // 完成关卡即打卡
            pointService.checkin(userId);
        }

        // ---------- 每日任务进度 ----------
        if (passed) {
            taskService.addProgress(userId, TaskService.TYPE_LEVEL_COUNT, 1);
        }
        taskService.addProgress(userId, TaskService.TYPE_CORRECT_COUNT, correctCount);

        SubmitResultVO vo = new SubmitResultVO();
        vo.setScore(score);
        vo.setCorrectCount(correctCount);
        vo.setTotalCount(total);
        vo.setStars(stars);
        vo.setPassScore(level.getPassScore());
        vo.setPassed(passed);
        vo.setUnlockNext(passed && hasNextLevel(level));
        vo.setGainPoints(gain);
        vo.setNewRecord(newRecord);
        vo.setWrongQuestions(wrongItems);
        return vo;
    }

    /** 校验关卡是否存在且已解锁 */
    private VocabLevel requireUnlocked(Long userId, Long levelId) {
        VocabLevel level = levelMapper.selectById(levelId);
        if (level == null || level.getStatus() == 0) {
            throw BizException.badRequest("关卡不存在");
        }
        List<VocabLevel> levels = levelMapper.selectList(new LambdaQueryWrapper<VocabLevel>()
                .eq(VocabLevel::getStatus, 1)
                .orderByAsc(VocabLevel::getSortNo));
        for (int i = 0; i < levels.size(); i++) {
            if (levels.get(i).getId().equals(levelId)) {
                if (i == 0) {
                    return level;
                }
                VocabLevel prev = levels.get(i - 1);
                UserLesson prevProgress = userLessonMapper.selectOne(new LambdaQueryWrapper<UserLesson>()
                        .eq(UserLesson::getUserId, userId)
                        .eq(UserLesson::getModule, MODULE)
                        .eq(UserLesson::getLessonId, prev.getId()));
                if (prevProgress == null || prevProgress.getScore() < prev.getPassScore()) {
                    throw BizException.badRequest("请先通过「" + prev.getName() + "」再挑战本关");
                }
                return level;
            }
        }
        return level;
    }

    private boolean hasNextLevel(VocabLevel current) {
        Long count = levelMapper.selectCount(new LambdaQueryWrapper<VocabLevel>()
                .eq(VocabLevel::getStatus, 1)
                .gt(VocabLevel::getSortNo, current.getSortNo()));
        return count != null && count > 0;
    }

    /** 判分归一化：去首尾空格（忽略大小写由 equalsIgnoreCase 完成） */
    private String normalize(String s) {
        return s == null ? "" : s.trim();
    }
}
