package com.cc.englishquest.controller;

import com.cc.englishquest.common.Result;
import com.cc.englishquest.service.StatsService;
import com.cc.englishquest.util.UserContext;
import com.cc.englishquest.vo.ChartVO;
import com.cc.englishquest.vo.StatsOverviewVO;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 学习数据看板
 */
@RestController
@RequestMapping("/api/stats")
@RequiredArgsConstructor
public class StatsController {

    private final StatsService statsService;

    /** 学习概览 */
    @GetMapping("/overview")
    public Result<StatsOverviewVO> overview() {
        return Result.success(statsService.overview(UserContext.userId()));
    }

    /** 学习热力图 */
    @GetMapping("/heatmap")
    public Result<List<ChartVO.HeatmapItem>> heatmap(@RequestParam(defaultValue = "84") Integer days) {
        return Result.success(statsService.heatmap(UserContext.userId(), days));
    }

    /** 正确率趋势 */
    @GetMapping("/accuracy-trend")
    public Result<List<ChartVO.TrendItem>> trend(@RequestParam(defaultValue = "14") Integer days) {
        return Result.success(statsService.accuracyTrend(UserContext.userId(), days));
    }

    /** 知识点掌握度雷达图 */
    @GetMapping("/radar")
    public Result<List<ChartVO.RadarItem>> radar() {
        return Result.success(statsService.radar(UserContext.userId()));
    }
}
