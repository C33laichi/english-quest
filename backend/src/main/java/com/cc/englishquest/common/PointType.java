package com.cc.englishquest.common;

/**
 * 积分业务类型常量
 */
public final class PointType {

    /** 答对题目 */
    public static final String ANSWER = "ANSWER";

    /** 完成关卡 */
    public static final String LEVEL = "LEVEL";

    /** 关卡满分 */
    public static final String FULL_SCORE = "FULL_SCORE";

    /** 每日首次登录 */
    public static final String LOGIN = "LOGIN";

    /** 连续打卡 */
    public static final String CHECKIN = "CHECKIN";

    /** 每日任务奖励 */
    public static final String TASK = "TASK";

    /**
     * 类型的中文名。
     *
     * <p>放在这里而不是前端：明细列表、后台日志、导出都要显示同一套文案，
     * 两处各写一份迟早会不一致。未知类型原样返回，方便以后新增类型时不至于显示空白。</p>
     */
    public static String label(String type) {
        if (type == null) {
            return "";
        }
        switch (type) {
            case ANSWER:
                return "答题得分";
            case LEVEL:
                return "通关奖励";
            case FULL_SCORE:
                return "满分奖励";
            case LOGIN:
                return "每日登录";
            case CHECKIN:
                return "每日打卡";
            case TASK:
                return "任务奖励";
            default:
                return type;
        }
    }

    private PointType() {
    }
}
