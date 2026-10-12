package com.cc.englishquest.service;

import cn.hutool.json.JSONArray;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cc.englishquest.common.BizException;
import com.cc.englishquest.common.PointType;
import com.cc.englishquest.dto.SubmitDTO;
import com.cc.englishquest.entity.GrammarLesson;
import com.cc.englishquest.entity.GrammarQuestion;
import com.cc.englishquest.entity.StudyRecord;
import com.cc.englishquest.entity.UserLesson;
import com.cc.englishquest.mapper.GrammarLessonMapper;
import com.cc.englishquest.mapper.GrammarQuestionMapper;
import com.cc.englishquest.mapper.StudyRecordMapper;
import com.cc.englishquest.mapper.UserLessonMapper;
import com.cc.englishquest.vo.GrammarLessonVO;
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
 * 语法闯关服务：28 天语法路线、按日解锁、讲义与测验
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class GrammarService {

    public static final String MODULE = "GRAMMAR";

    private final GrammarLessonMapper lessonMapper;
    private final GrammarQuestionMapper questionMapper;
    private final UserLessonMapper userLessonMapper;
    private final StudyRecordMapper studyRecordMapper;
    private final PointService pointService;
    private final ErrorBookService errorBookService;
    private final TaskService taskService;

    /** 28 天路线图 */
    public List<GrammarLessonVO> listLessons(Long userId) {
        List<GrammarLesson> lessons = lessonMapper.selectList(new LambdaQueryWrapper<GrammarLesson>()
                .orderByAsc(GrammarLesson::getDayNo));
        Map<Integer, UserLesson> progressMap = new HashMap<>();
        for (UserLesson ul : userLessonMapper.selectList(new LambdaQueryWrapper<UserLesson>()
                .eq(UserLesson::getUserId, userId)
                .eq(UserLesson::getModule, MODULE))) {
            if (ul.getDayNo() != null) {
                progressMap.put(ul.getDayNo(), ul);
            }
        }

        List<GrammarLessonVO> result = new ArrayList<>();
        boolean prevPassed = true;
        for (GrammarLesson lesson : lessons) {
            UserLesson progress = progressMap.get(lesson.getDayNo());
            GrammarLessonVO vo = new GrammarLessonVO();
            vo.setId(lesson.getId());
            vo.setDayNo(lesson.getDayNo());
            vo.setTitle(lesson.getTitle());
            vo.setStage(lesson.getStage());
            vo.setMode(lesson.getMode());
            vo.setQuestionCount(lesson.getQuestionCount());
            vo.setPassScore(lesson.getPassScore());
            vo.setLocked(!prevPassed);
            vo.setPassed(progress != null && progress.getScore() >= lesson.getPassScore());
            vo.setBestScore(progress == null ? 0 : progress.getScore());
            vo.setStars(progress == null ? 0 : progress.getStars());
            vo.setFinishTime(progress == null ? null : progress.getFinishTime());
            result.add(vo);
            prevPassed = vo.getPassed();
        }
        return result;
    }

    /** 关卡详情：讲义 + 题目 */
    public Map<String, Object> getLesson(Long userId, Integer day) {
        GrammarLesson lesson = requireUnlocked(userId, day);

        // 解析讲义内容（容错：脏数据降级为纯文本行，不让整接口 500）
        List<Map<String, Object>> points = new ArrayList<>();
        String content = lesson.getContent();
        if (content != null && !content.isBlank()) {
            try {
                if (JSONUtil.isTypeJSONArray(content)) {
                    JSONArray arr = JSONUtil.parseArray(content);
                    for (Object o : arr) {
                        if (!(o instanceof JSONObject jo)) {
                            continue;
                        }
                        Map<String, Object> point = new LinkedHashMap<>();
                        point.put("text", jo.getStr("text"));
                        point.put("example", jo.getStr("example"));
                        points.add(point);
                    }
                } else {
                    for (String line : content.split("\\r?\\n")) {
                        if (line.isBlank()) {
                            continue;
                        }
                        Map<String, Object> point = new LinkedHashMap<>();
                        point.put("text", line.trim());
                        point.put("example", null);
                        points.add(point);
                    }
                }
            } catch (Exception e) {
                log.warn("第 {} 天讲义 JSON 解析失败，降级为纯文本展示：{}", day, e.getMessage());
                points.clear();
                Map<String, Object> point = new LinkedHashMap<>();
                point.put("text", content.trim());
                point.put("example", null);
                points.add(point);
            }
        }

        List<GrammarQuestion> questions = questionMapper.selectList(new LambdaQueryWrapper<GrammarQuestion>()
                .eq(GrammarQuestion::getLessonId, lesson.getId())
                .eq(GrammarQuestion::getStatus, 1));
        List<QuestionVO> questionVOS = new ArrayList<>();
        for (GrammarQuestion q : questions) {
            QuestionVO vo = new QuestionVO();
            vo.setId(q.getId());
            vo.setType(q.getType());
            vo.setStem(q.getStem());
            if ("CHOICE".equals(q.getType())) {
                vo.setOptionList(Arrays.asList(
                        new QuestionVO.OptionVO("A", q.getOptionA()),
                        new QuestionVO.OptionVO("B", q.getOptionB()),
                        new QuestionVO.OptionVO("C", q.getOptionC()),
                        new QuestionVO.OptionVO("D", q.getOptionD())));
                vo.setOptions(Arrays.asList(q.getOptionA(), q.getOptionB(), q.getOptionC(), q.getOptionD()));
            } else {
                vo.setOptions(Collections.emptyList());
            }
            questionVOS.add(vo);
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", lesson.getId());
        data.put("dayNo", lesson.getDayNo());
        data.put("title", lesson.getTitle());
        data.put("stage", lesson.getStage());
        data.put("mode", lesson.getMode());
        data.put("passScore", lesson.getPassScore());
        data.put("points", points);
        data.put("questions", questionVOS);
        return data;
    }

    /** 提交测验 */
    @Transactional(rollbackFor = Exception.class)
    public SubmitResultVO submit(Long userId, Integer day, SubmitDTO dto) {
        GrammarLesson lesson = requireUnlocked(userId, day);
        if (dto.getAnswers() == null || dto.getAnswers().isEmpty()) {
            throw BizException.badRequest("答题内容不能为空");
        }
        List<Long> ids = dto.getAnswers().stream().map(SubmitDTO.AnswerItem::getQuestionId).toList();
        List<GrammarQuestion> questions = questionMapper.selectList(new LambdaQueryWrapper<GrammarQuestion>()
                .in(GrammarQuestion::getId, ids)
                .eq(GrammarQuestion::getLessonId, lesson.getId()));
        if (questions.isEmpty()) {
            throw BizException.badRequest("题目不存在或不属于该关卡");
        }
        Map<Long, GrammarQuestion> questionMap = new HashMap<>();
        questions.forEach(q -> questionMap.put(q.getId(), q));

        int correctCount = 0;
        List<SubmitResultVO.WrongItem> wrongItems = new ArrayList<>();
        for (SubmitDTO.AnswerItem item : dto.getAnswers()) {
            GrammarQuestion q = questionMap.get(item.getQuestionId());
            if (q == null) {
                continue;
            }
            String userAnswer = item.getUserAnswer() == null ? "" : item.getUserAnswer();
            boolean correct = normalize(q.getAnswer()).equalsIgnoreCase(normalize(userAnswer));

            StudyRecord record = new StudyRecord();
            record.setUserId(userId);
            record.setModule(MODULE);
            record.setTargetId(lesson.getId());
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
                errorBookService.record(userId, MODULE, q.getId(),
                        q.getKnowledgePoint(), q.getStem(),
                        q.getAnswer(), userAnswer, q.getAnalysis());
                SubmitResultVO.WrongItem wrong = new SubmitResultVO.WrongItem();
                wrong.setQuestionId(q.getId());
                wrong.setStem(q.getStem());
                wrong.setUserAnswer(userAnswer);
                wrong.setCorrectAnswer(q.getAnswer());
                // 错题回顾要把选项**内容**一起带回去：
                // 只给 A/B/C/D，用户回顾时根本想不起来当时选的是什么
                wrong.setUserAnswerText(optionText(q, userAnswer));
                wrong.setCorrectAnswerText(optionText(q, q.getAnswer()));
                wrong.setAnalysis(q.getAnalysis());
                wrongItems.add(wrong);
            }
        }

        int total = dto.getAnswers().size();
        int score = (int) Math.round(correctCount * 100.0 / total);
        int stars = score >= 100 ? 3 : score >= 80 ? 2 : score >= 60 ? 1 : 0;
        boolean passed = score >= lesson.getPassScore();

        UserLesson progress = userLessonMapper.selectOne(new LambdaQueryWrapper<UserLesson>()
                .eq(UserLesson::getUserId, userId)
                .eq(UserLesson::getModule, MODULE)
                .eq(UserLesson::getLessonId, lesson.getId()));
        boolean newRecord = progress == null || score > progress.getScore();
        if (progress == null) {
            progress = new UserLesson();
            progress.setUserId(userId);
            progress.setLessonId(lesson.getId());
            progress.setModule(MODULE);
            progress.setDayNo(lesson.getDayNo());
            progress.setScore(score);
            progress.setPassScore(lesson.getPassScore());
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

        String today = LocalDate.now().toString();
        int gain = 0;
        gain += pointService.addPoints(userId, correctCount * pointService.getAnswerPoint(),
                PointType.ANSWER, "ans-" + MODULE + "-" + day + "-" + today, "语法闯关答题得分");
        if (passed) {
            gain += pointService.addPoints(userId, pointService.getLevelPoint(),
                    PointType.LEVEL, "level-" + MODULE + "-" + day, "通过语法第" + day + "天：" + lesson.getTitle());
            if (score >= 100) {
                gain += pointService.addPoints(userId, pointService.getFullScorePoint(),
                        PointType.FULL_SCORE, "full-" + MODULE + "-" + day, "语法第" + day + "天满分");
            }
            pointService.checkin(userId);
        }
        if (passed) {
            taskService.addProgress(userId, TaskService.TYPE_LEVEL_COUNT, 1);
        }
        taskService.addProgress(userId, TaskService.TYPE_CORRECT_COUNT, correctCount);

        SubmitResultVO vo = new SubmitResultVO();
        vo.setScore(score);
        vo.setCorrectCount(correctCount);
        vo.setTotalCount(total);
        vo.setStars(stars);
        vo.setPassScore(lesson.getPassScore());
        vo.setPassed(passed);
        vo.setUnlockNext(passed && day < maxDay());
        vo.setGainPoints(gain);
        vo.setNewRecord(newRecord);
        vo.setWrongQuestions(wrongItems);
        return vo;
    }

    /** 按日解锁判定：第 1 天默认解锁，第 N 天需第 N-1 天及格 */
    public boolean canUnlock(Long userId, Integer day) {
        if (day == null || day <= 1) {
            return true;
        }
        GrammarLesson prev = lessonMapper.selectOne(new LambdaQueryWrapper<GrammarLesson>()
                .eq(GrammarLesson::getDayNo, day - 1));
        if (prev == null) {
            return false;
        }
        UserLesson prevProgress = userLessonMapper.selectOne(new LambdaQueryWrapper<UserLesson>()
                .eq(UserLesson::getUserId, userId)
                .eq(UserLesson::getModule, MODULE)
                .eq(UserLesson::getLessonId, prev.getId()));
        return prevProgress != null && prevProgress.getScore() >= prev.getPassScore();
    }

    private GrammarLesson requireUnlocked(Long userId, Integer day) {
        GrammarLesson lesson = lessonMapper.selectOne(new LambdaQueryWrapper<GrammarLesson>()
                .eq(GrammarLesson::getDayNo, day));
        if (lesson == null) {
            throw BizException.badRequest("该关卡不存在");
        }
        if (!canUnlock(userId, day)) {
            throw BizException.badRequest("请先通过第 " + (day - 1) + " 天的关卡");
        }
        return lesson;
    }

    private int maxDay() {
        Long count = lessonMapper.selectCount(null);
        return count == null ? 28 : count.intValue();
    }

    private String normalize(String s) {
        return s == null ? "" : s.trim();
    }

    /**
     * 把选项 key（A/B/C/D）翻译成选项的完整文本。
     * <p>
     * 错题回顾场景下必须给文本：用户看到"A"无法回忆起当时选了什么，
     * 也不方便和正确答案对照。多选题的答案是 "the, /" 这种含逗号的串，
     * 这里不拆分，整体返回（与展示口径一致，拆开反而看不懂）。
     *
     * @param q   题目
     * @param key 选项 key，可能为 null / 空 / 非法值
     * @return 选项文本；未作答或 key 非法时返回空串
     */
    private String optionText(GrammarQuestion q, String key) {
        if (q == null) {
            return "";
        }
        String k = normalize(key).toUpperCase();
        if (k.isEmpty()) {
            return "";
        }
        return switch (k) {
            case "A" -> normalize(q.getOptionA());
            case "B" -> normalize(q.getOptionB());
            case "C" -> normalize(q.getOptionC());
            case "D" -> normalize(q.getOptionD());
            default -> "";
        };
    }
}
