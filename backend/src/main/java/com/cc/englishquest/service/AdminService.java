package com.cc.englishquest.service;

import cn.hutool.crypto.digest.BCrypt;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cc.englishquest.common.BizException;
import com.cc.englishquest.common.PageResult;
import com.cc.englishquest.dto.AdminUserDTO;
import com.cc.englishquest.entity.*;
import com.cc.englishquest.mapper.*;
import com.cc.englishquest.vo.AdminStatsVO;
import com.cc.englishquest.vo.UserVO;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 后台管理服务
 */
@Service
@RequiredArgsConstructor
public class AdminService {

    private final UserMapper userMapper;
    private final VocabLevelMapper vocabLevelMapper;
    private final VocabQuestionMapper vocabQuestionMapper;
    private final GrammarLessonMapper grammarLessonMapper;
    private final GrammarQuestionMapper grammarQuestionMapper;
    private final StudyRecordMapper studyRecordMapper;
    private final UserLessonMapper userLessonMapper;
    private final AiCallLogMapper aiCallLogMapper;
    private final StatsMapper statsMapper;

    /** 管理员「重置密码」后的默认密码，可由环境变量覆盖，仓库中不保留真实密码 */
    @Value("${app.admin.reset-default-password:}")
    private String resetDefaultPassword;

    // ---------------- 用户管理 ----------------

    public PageResult<UserVO> users(int pageNum, int pageSize, String keyword, String role) {
        Page<User> page = userMapper.selectPage(new Page<>(pageNum, pageSize),
                new LambdaQueryWrapper<User>()
                        .and(keyword != null && !keyword.isBlank(), w -> w
                                .like(User::getUsername, keyword)
                                .or().like(User::getNickname, keyword))
                        .eq(role != null && !role.isBlank(), User::getRole, role)
                        .orderByDesc(User::getId));
        List<UserVO> list = page.getRecords().stream().map(u -> {
            UserVO vo = new UserVO();
            vo.setId(u.getId());
            vo.setUsername(u.getUsername());
            vo.setNickname(u.getNickname());
            vo.setRole(u.getRole());
            vo.setAvatar(u.getAvatar());
            vo.setTotalPoints(u.getTotalPoints());
            vo.setStreakDays(u.getStreakDays());
            vo.setLastStudyDate(u.getLastStudyDate());
            vo.setStatus(u.getStatus());
            vo.setCreateTime(u.getCreateTime());
            return vo;
        }).toList();
        return PageResult.of(page.getTotal(), list);
    }

    @Transactional(rollbackFor = Exception.class)
    public void updateUserStatus(Long id, Integer status) {
        User user = requireUser(id);
        if ("ADMIN".equals(user.getRole())) {
            throw BizException.badRequest("不能禁用管理员账号");
        }
        user.setStatus(status);
        userMapper.updateById(user);
    }

    @Transactional(rollbackFor = Exception.class)
    public void resetPassword(Long id) {
        User user = requireUser(id);
        user.setPassword(BCrypt.hashpw(resetDefaultPassword));
        userMapper.updateById(user);
    }

    @Transactional(rollbackFor = Exception.class)
    public void deleteUser(Long id) {
        User user = requireUser(id);
        if ("ADMIN".equals(user.getRole())) {
            throw BizException.badRequest("不能删除管理员账号");
        }
        userMapper.deleteById(id);
    }

    /**
     * 新增用户（可指定角色）—— 任务书「用户数据的添加」，
     * 同时也是**管理员账号的注册入口**（公开注册只允许学生，见 RegisterDTO 注释）。
     */
    @Transactional(rollbackFor = Exception.class)
    public UserVO createUser(AdminUserDTO dto) {
        Long exists = userMapper.selectCount(new LambdaQueryWrapper<User>()
                .eq(User::getUsername, dto.getUsername()));
        if (exists != null && exists > 0) {
            throw BizException.badRequest("该用户名已被注册");
        }
        User user = new User();
        user.setUsername(dto.getUsername());
        user.setPassword(BCrypt.hashpw(dto.getPassword()));
        user.setNickname(dto.getNickname() == null || dto.getNickname().isBlank()
                ? dto.getUsername() : dto.getNickname());
        user.setRole(normalizeRole(dto.getRole()));
        user.setTotalPoints(0);
        user.setStreakDays(0);
        user.setStatus(1);
        user.setCreateTime(LocalDateTime.now());
        userMapper.insert(user);

        UserVO vo = new UserVO();
        vo.setId(user.getId());
        vo.setUsername(user.getUsername());
        vo.setNickname(user.getNickname());
        vo.setRole(user.getRole());
        vo.setTotalPoints(user.getTotalPoints());
        vo.setStreakDays(user.getStreakDays());
        vo.setStatus(user.getStatus());
        vo.setCreateTime(user.getCreateTime());
        return vo;
    }

    /** 角色白名单：只接受 STUDENT / ADMIN，缺省按 STUDENT 处理 */
    private String normalizeRole(String role) {
        if (role == null || role.isBlank()) {
            return "STUDENT";
        }
        String normalized = role.trim().toUpperCase();
        if (!"STUDENT".equals(normalized) && !"ADMIN".equals(normalized)) {
            throw BizException.badRequest("角色只能是 STUDENT 或 ADMIN");
        }
        return normalized;
    }

    // ---------------- 词汇题库 ----------------

    public PageResult<VocabQuestion> vocabQuestions(int pageNum, int pageSize, Long levelId, String keyword) {
        Page<VocabQuestion> page = vocabQuestionMapper.selectPage(new Page<>(pageNum, pageSize),
                new LambdaQueryWrapper<VocabQuestion>()
                        .eq(levelId != null, VocabQuestion::getLevelId, levelId)
                        .and(keyword != null && !keyword.isBlank(), w -> w
                                .like(VocabQuestion::getWord, keyword)
                                .or().like(VocabQuestion::getMeaning, keyword))
                        .orderByDesc(VocabQuestion::getId));
        return PageResult.of(page.getTotal(), page.getRecords());
    }

    @Transactional(rollbackFor = Exception.class)
    public void saveVocabQuestion(VocabQuestion question) {
        if (question.getLevelId() == null || question.getWord() == null || question.getAnswer() == null) {
            throw BizException.badRequest("关卡、单词与答案不能为空");
        }
        if (question.getId() == null) {
            question.setStatus(question.getStatus() == null ? 1 : question.getStatus());
            question.setCreateTime(LocalDateTime.now());
            vocabQuestionMapper.insert(question);
        } else {
            vocabQuestionMapper.updateById(question);
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void deleteVocabQuestion(Long id) {
        vocabQuestionMapper.deleteById(id);
    }

    public List<VocabLevel> vocabLevels() {
        return vocabLevelMapper.selectList(new LambdaQueryWrapper<VocabLevel>()
                .orderByAsc(VocabLevel::getSortNo));
    }

    /** 新增 / 修改词汇关卡 */
    @Transactional(rollbackFor = Exception.class)
    public void saveVocabLevel(VocabLevel level) {
        if (level.getName() == null || level.getName().isBlank()) {
            throw BizException.badRequest("关卡名称不能为空");
        }
        if (level.getId() == null) {
            if (level.getQuestionCount() == null || level.getQuestionCount() <= 0) {
                level.setQuestionCount(10);
            }
            if (level.getSortNo() == null) {
                level.setSortNo(nextVocabSortNo());
            }
            level.setStatus(level.getStatus() == null ? 1 : level.getStatus());
            level.setCreateTime(LocalDateTime.now());
            vocabLevelMapper.insert(level);
        } else {
            // updateById 默认忽略 null 字段，前端未回填的属性不会被抹掉
            vocabLevelMapper.updateById(level);
        }
    }

    /** 下一个关序号（新增关卡时的缺省值） */
    private int nextVocabSortNo() {
        return vocabLevelMapper.selectList(null).stream()
                .map(VocabLevel::getSortNo)
                .filter(java.util.Objects::nonNull)
                .max(Integer::compareTo)
                .orElse(0) + 1;
    }

    /**
     * 删除词汇关卡。
     * 有关联题目、或已有学生闯关进度时一律拒绝 —— 否则会留下"孤儿题目"，
     * 并让学生端的进度记录指向一个不存在的关卡。
     */
    @Transactional(rollbackFor = Exception.class)
    public void deleteVocabLevel(Long id) {
        if (vocabLevelMapper.selectById(id) == null) {
            throw BizException.badRequest("关卡不存在");
        }
        Long questionCount = vocabQuestionMapper.selectCount(new LambdaQueryWrapper<VocabQuestion>()
                .eq(VocabQuestion::getLevelId, id));
        if (questionCount != null && questionCount > 0) {
            throw BizException.badRequest("该关卡下还有 " + questionCount + " 道题目，请先删除题目再删关卡");
        }
        Long progressCount = userLessonMapper.selectCount(new LambdaQueryWrapper<UserLesson>()
                .eq(UserLesson::getModule, "VOCAB")
                .eq(UserLesson::getLessonId, id));
        if (progressCount != null && progressCount > 0) {
            throw BizException.badRequest("已有 " + progressCount + " 条学生闯关记录，不能删除该关卡");
        }
        vocabLevelMapper.deleteById(id);
    }

    // ---------------- 语法题库 ----------------

    public List<GrammarLesson> grammarLessons() {
        return grammarLessonMapper.selectList(new LambdaQueryWrapper<GrammarLesson>()
                .orderByAsc(GrammarLesson::getDayNo));
    }

    public PageResult<GrammarQuestion> grammarQuestions(int pageNum, int pageSize, Long lessonId, String keyword) {
        Page<GrammarQuestion> page = grammarQuestionMapper.selectPage(new Page<>(pageNum, pageSize),
                new LambdaQueryWrapper<GrammarQuestion>()
                        .eq(lessonId != null, GrammarQuestion::getLessonId, lessonId)
                        .and(keyword != null && !keyword.isBlank(), w -> w
                                .like(GrammarQuestion::getStem, keyword)
                                .or().like(GrammarQuestion::getKnowledgePoint, keyword))
                        .orderByDesc(GrammarQuestion::getId));
        return PageResult.of(page.getTotal(), page.getRecords());
    }

    @Transactional(rollbackFor = Exception.class)
    public void saveGrammarQuestion(GrammarQuestion question) {
        if (question.getLessonId() == null || question.getStem() == null || question.getAnswer() == null) {
            throw BizException.badRequest("关卡、题干与答案不能为空");
        }
        if (question.getId() == null) {
            question.setStatus(question.getStatus() == null ? 1 : question.getStatus());
            question.setCreateTime(LocalDateTime.now());
            grammarQuestionMapper.insert(question);
        } else {
            grammarQuestionMapper.updateById(question);
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void deleteGrammarQuestion(Long id) {
        grammarQuestionMapper.deleteById(id);
    }

    /** 新增 / 修改语法关卡（Day） */
    @Transactional(rollbackFor = Exception.class)
    public void saveGrammarLesson(GrammarLesson lesson) {
        if (lesson.getDayNo() == null || lesson.getDayNo() <= 0) {
            throw BizException.badRequest("请填写关卡 Day 序号");
        }
        if (lesson.getTitle() == null || lesson.getTitle().isBlank()) {
            throw BizException.badRequest("关卡标题不能为空");
        }
        Long dup = grammarLessonMapper.selectCount(new LambdaQueryWrapper<GrammarLesson>()
                .eq(GrammarLesson::getDayNo, lesson.getDayNo())
                .ne(lesson.getId() != null, GrammarLesson::getId, lesson.getId()));
        if (dup != null && dup > 0) {
            throw BizException.badRequest("Day " + lesson.getDayNo() + " 已存在");
        }
        if (lesson.getId() == null) {
            if (lesson.getQuestionCount() == null || lesson.getQuestionCount() <= 0) {
                lesson.setQuestionCount(10);
            }
            lesson.setCreateTime(LocalDateTime.now());
            grammarLessonMapper.insert(lesson);
        } else {
            grammarLessonMapper.updateById(lesson);
        }
    }

    /**
     * 删除语法关卡（Day）。
     *
     * <p>比词汇关卡多一道约束：语法关是**按日解锁**的（第 N 天需第 N-1 天及格），
     * 所以只允许从**最后一天**往前删。删中间那天会让它后面的所有关卡永久锁死。</p>
     */
    @Transactional(rollbackFor = Exception.class)
    public void deleteGrammarLesson(Long id) {
        GrammarLesson lesson = grammarLessonMapper.selectById(id);
        if (lesson == null) {
            throw BizException.badRequest("关卡不存在");
        }
        Long later = grammarLessonMapper.selectCount(new LambdaQueryWrapper<GrammarLesson>()
                .gt(GrammarLesson::getDayNo, lesson.getDayNo()));
        if (later != null && later > 0) {
            throw BizException.badRequest("后面还有 " + later + " 天，只能从最后一天开始删"
                    + "（否则后面的关卡会因为缺前序而永久锁死）");
        }
        Long questionCount = grammarQuestionMapper.selectCount(new LambdaQueryWrapper<GrammarQuestion>()
                .eq(GrammarQuestion::getLessonId, id));
        if (questionCount != null && questionCount > 0) {
            throw BizException.badRequest("该关卡下还有 " + questionCount + " 道题目，请先删除题目再删关卡");
        }
        Long progressCount = userLessonMapper.selectCount(new LambdaQueryWrapper<UserLesson>()
                .eq(UserLesson::getModule, "GRAMMAR")
                .eq(UserLesson::getLessonId, id));
        if (progressCount != null && progressCount > 0) {
            throw BizException.badRequest("已有 " + progressCount + " 条学习记录，不能删除该关卡");
        }
        grammarLessonMapper.deleteById(id);
    }

    // ---------------- 全局统计 ----------------

    public AdminStatsVO stats() {
        AdminStatsVO vo = new AdminStatsVO();
        vo.setUserCount(userMapper.selectCount(new LambdaQueryWrapper<User>().eq(User::getRole, "STUDENT")));
        // 题数会随批量导入持续增长，单独给出词汇/语法两项，供后台总览直接展示
        Long vocabQuestionCount = vocabQuestionMapper.selectCount(null);
        Long grammarQuestionCount = grammarQuestionMapper.selectCount(null);
        vo.setVocabQuestionCount(vocabQuestionCount);
        vo.setGrammarQuestionCount(grammarQuestionCount);
        vo.setQuestionCount(vocabQuestionCount + grammarQuestionCount);
        vo.setAnswerCount(studyRecordMapper.selectCount(null));
        vo.setAiCallCount(aiCallLogMapper.selectCount(null));
        vo.setVocabLevelCount(vocabLevelMapper.selectCount(null));
        vo.setGrammarLessonCount(grammarLessonMapper.selectCount(null));
        LocalDateTime todayStart = LocalDate.now().atStartOfDay();
        vo.setTodayAnswerCount(studyRecordMapper.selectCount(new LambdaQueryWrapper<StudyRecord>()
                .ge(StudyRecord::getCreateTime, todayStart)));
        vo.setActiveToday(statsMapper.activeUsers(todayStart));
        return vo;
    }

    private User requireUser(Long id) {
        User user = userMapper.selectById(id);
        if (user == null) {
            throw BizException.badRequest("用户不存在");
        }
        return user;
    }
}
