package com.cc.englishquest.controller;

import com.cc.englishquest.common.Result;
import com.cc.englishquest.service.GameService;
import com.cc.englishquest.service.TaskService;
import com.cc.englishquest.util.UserContext;
import com.cc.englishquest.vo.GameOverviewVO;
import com.cc.englishquest.vo.RankVO;
import com.cc.englishquest.vo.TaskVO;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 游戏机制：积分、打卡、任务、排行榜
 */
@RestController
@RequestMapping("/api/game")
@RequiredArgsConstructor
public class GameController {

    private final GameService gameService;
    private final TaskService taskService;

    /** 积分总览（等级、连续打卡、今日积分、排名） */
    @GetMapping("/overview")
    public Result<GameOverviewVO> overview() {
        return Result.success(gameService.overview(UserContext.userId()));
    }

    /** 打卡 */
    @PostMapping("/checkin")
    public Result<Map<String, Object>> checkin() {
        int streak = gameService.checkin(UserContext.userId());
        return Result.success(Map.of("streakDays", streak));
    }

    /** 今日任务列表 */
    @GetMapping("/tasks")
    public Result<List<TaskVO>> tasks() {
        return Result.success(taskService.listToday(UserContext.userId()));
    }

    /** 领取任务奖励 */
    @PostMapping("/tasks/{code}/claim")
    public Result<Map<String, Object>> claim(@PathVariable String code) {
        int points = taskService.claim(UserContext.userId(), code);
        return Result.success(Map.of("gainPoints", points));
    }

    /** 排行榜：type = points / streak */
    @GetMapping("/rank")
    public Result<List<RankVO>> rank(@RequestParam(defaultValue = "points") String type) {
        return Result.success(gameService.rank(type, UserContext.userId()));
    }
}
