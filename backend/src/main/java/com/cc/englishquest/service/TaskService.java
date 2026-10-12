package com.cc.englishquest.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cc.englishquest.common.BizException;
import com.cc.englishquest.common.PointType;
import com.cc.englishquest.entity.DailyTask;
import com.cc.englishquest.entity.UserTask;
import com.cc.englishquest.mapper.DailyTaskMapper;
import com.cc.englishquest.mapper.UserTaskMapper;
import com.cc.englishquest.vo.TaskVO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 每日任务服务
 */
@Service
@RequiredArgsConstructor
public class TaskService {

    private final DailyTaskMapper dailyTaskMapper;
    private final UserTaskMapper userTaskMapper;
    private final PointService pointService;

    /** 任务类型常量 */
    public static final String TYPE_LEVEL_COUNT = "LEVEL_COUNT";
    public static final String TYPE_CORRECT_COUNT = "CORRECT_COUNT";
    public static final String TYPE_AI_COUNT = "AI_COUNT";
    public static final String TYPE_LISTEN_COUNT = "LISTEN_COUNT";

    /** 确保今天有任务记录 */
    private List<UserTask> ensureToday(Long userId) {
        LocalDate today = LocalDate.now();
        List<DailyTask> tasks = dailyTaskMapper.selectList(new LambdaQueryWrapper<DailyTask>()
                .eq(DailyTask::getStatus, 1)
                .orderByAsc(DailyTask::getSortNo));
        List<UserTask> result = new ArrayList<>();
        for (DailyTask task : tasks) {
            UserTask ut = userTaskMapper.selectOne(new LambdaQueryWrapper<UserTask>()
                    .eq(UserTask::getUserId, userId)
                    .eq(UserTask::getTaskDate, today)
                    .eq(UserTask::getTaskCode, task.getCode()));
            if (ut == null) {
                ut = new UserTask();
                ut.setUserId(userId);
                ut.setTaskDate(today);
                ut.setTaskCode(task.getCode());
                ut.setProgress(0);
                ut.setFinished(0);
                ut.setClaimed(0);
                ut.setCreateTime(LocalDateTime.now());
                userTaskMapper.insert(ut);
            }
            result.add(ut);
        }
        return result;
    }

    /** 更新任务进度（按任务类型累加） */
    @Transactional(rollbackFor = Exception.class)
    public void addProgress(Long userId, String taskType, int delta) {
        if (delta <= 0) {
            return;
        }
        ensureToday(userId);
        LocalDate today = LocalDate.now();
        List<DailyTask> tasks = dailyTaskMapper.selectList(new LambdaQueryWrapper<DailyTask>()
                .eq(DailyTask::getTaskType, taskType)
                .eq(DailyTask::getStatus, 1));
        for (DailyTask task : tasks) {
            UserTask ut = userTaskMapper.selectOne(new LambdaQueryWrapper<UserTask>()
                    .eq(UserTask::getUserId, userId)
                    .eq(UserTask::getTaskDate, today)
                    .eq(UserTask::getTaskCode, task.getCode()));
            if (ut == null) {
                continue;
            }
            ut.setProgress(ut.getProgress() + delta);
            if (ut.getProgress() >= task.getTargetValue()) {
                ut.setFinished(1);
            }
            userTaskMapper.updateById(ut);
        }
    }

    /** 今日任务列表 */
    public List<TaskVO> listToday(Long userId) {
        List<UserTask> userTasks = ensureToday(userId);
        List<DailyTask> tasks = dailyTaskMapper.selectList(new LambdaQueryWrapper<DailyTask>()
                .eq(DailyTask::getStatus, 1)
                .orderByAsc(DailyTask::getSortNo));
        List<TaskVO> result = new ArrayList<>();
        for (DailyTask task : tasks) {
            UserTask ut = userTasks.stream()
                    .filter(u -> u.getTaskCode().equals(task.getCode()))
                    .findFirst().orElse(null);
            TaskVO vo = new TaskVO();
            vo.setCode(task.getCode());
            vo.setTitle(task.getTitle());
            vo.setTaskType(task.getTaskType());
            vo.setTargetValue(task.getTargetValue());
            vo.setRewardPoints(task.getRewardPoints());
            vo.setProgress(ut == null ? 0 : ut.getProgress());
            vo.setFinished(ut != null && ut.getFinished() == 1);
            vo.setClaimed(ut != null && ut.getClaimed() == 1);
            result.add(vo);
        }
        return result;
    }

    /** 领取任务奖励 */
    @Transactional(rollbackFor = Exception.class)
    public int claim(Long userId, String taskCode) {
        LocalDate today = LocalDate.now();
        ensureToday(userId);
        DailyTask task = dailyTaskMapper.selectOne(new LambdaQueryWrapper<DailyTask>()
                .eq(DailyTask::getCode, taskCode));
        if (task == null) {
            throw BizException.badRequest("任务不存在");
        }
        UserTask ut = userTaskMapper.selectOne(new LambdaQueryWrapper<UserTask>()
                .eq(UserTask::getUserId, userId)
                .eq(UserTask::getTaskDate, today)
                .eq(UserTask::getTaskCode, taskCode));
        if (ut == null || ut.getFinished() != 1) {
            throw BizException.badRequest("任务尚未完成");
        }
        if (ut.getClaimed() == 1) {
            throw BizException.badRequest("奖励已领取");
        }
        ut.setClaimed(1);
        userTaskMapper.updateById(ut);
        return pointService.addPoints(userId, task.getRewardPoints(), PointType.TASK,
                "task-" + today + "-" + taskCode, "每日任务：" + task.getTitle());
    }
}
