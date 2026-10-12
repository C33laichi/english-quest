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

    /** 当前等级区间内已获得的积分（totalPoints - 本段起点） */
    private Integer currentLevelPoints;

    /**
     * 当前等级区间升满所需的总积分（= 下一级门槛 - 本段起点）。
     *
     * <p>与 {@link #currentLevelPoints} <b>同分母</b>：进度 = cur / need，
     * 「还差多少分」= need - cur。满级时为 <b>-1</b>，前端据此隐藏进度条。</p>
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
