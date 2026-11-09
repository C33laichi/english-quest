package com.cc.englishquest.vo;

import lombok.Data;

/**
 * 打卡结果。
 *
 * <p>把「连续天数」和「本次实发积分」一起返回，是因为这两个数在界面上必须同时出现：
 * 提示语写「打卡成功，+5 积分，连续 3 天」。
 * 早期接口只返回连续天数，前端只能把它当成加分值来猜（`gainPoints ?? 5`），
 * 一旦后端改了发放规则，界面上的数字就会和实际到账不符 —— 这正是「打卡加 5 却只涨 1 分」
 * 那个缺陷的一部分。</p>
 *
 * <p>顺带把打卡后的总积分一并带回：打卡是首页的操作，页面不必为了刷新一个数字再请求一次总览。</p>
 */
@Data
public class CheckinVO {

    /** 打卡后的连续天数 */
    private int streakDays;

    /** 本次实际到账积分（每日上限截断后；0 表示今日已打过卡或已达上限） */
    private int gainPoints;

    /** 打卡后的总积分 */
    private int totalPoints;
}
