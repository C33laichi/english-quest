package com.cc.englishquest.vo;

import lombok.Data;

import java.util.List;

/**
 * 游戏化数据总览
 */
@Data
public class GameOverviewVO {

    private Integer totalPoints;

    /** 等级（由累计积分换算） */
    private Integer level;

    /** 等级称号 */
    private String levelName;

    /** 当前等级区间的起始积分（1 级 0 分、2 级 100 分……） */
    private Integer levelBasePoints;

    /**
     * 下一级门槛（累计积分口径），满级时为 <b>-1</b>。
     *
     * <p>首页现在用「累计 / 门槛」展示等级进度：113 分显示 `113 / 300`，
     * 与顶部「总积分 113」是同一个数，不会出现「总分 113 却只画了 13」的误解。
     * 进度条按 totalPoints / nextLevelThreshold 计算，与文字同分母。</p>
     */
    private Integer nextLevelThreshold;

    /** 当前等级区间内已获得的积分（totalPoints - 本段起点）——本段口径，非首页默认展示 */
    private Integer currentLevelPoints;

    /**
     * 当前等级区间升满所需的总积分（= 下一级门槛 - 本段起点）。
     *
     * <p>与 {@link #currentLevelPoints} <b>同分母</b>：进度 = cur / need，
     * 「还差多少分」= need - cur。满级时为 <b>-1</b>。</p>
     *
     * <p>这套「本段口径」保留给需要「本级进度」的场合（如等级说明卡），
     * 首页主进度已改用 {@link #nextLevelThreshold} 的累计口径。</p>
     */
    private Integer nextLevelPoints;

    private Integer streakDays;

    /** 今日已获得积分（受每日上限约束） */
    private Integer todayPoints;

    /** 每日积分上限 */
    private Integer dailyLimit;

    /** 是否已打卡 */
    private Boolean checkedToday;

    /** 当前排名 */
    private Integer rankNo;

    /**
     * 完整等级阶梯（等级 / 称号 / 所需积分）。
     * 首页在等级旁放了一个问号，悬浮时要列出全部等级，
     * 数据源是 PointService 的等级表，前端不另抄一份。
     */
    private List<LevelStepVO> levels;
}
