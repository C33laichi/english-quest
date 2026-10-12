package com.cc.englishquest.vo;

import lombok.Data;

/**
 * 每日任务视图
 */
@Data
public class TaskVO {

    private String code;

    private String title;

    private String taskType;

    private Integer targetValue;

    private Integer progress;

    private Integer rewardPoints;

    private Boolean finished;

    private Boolean claimed;
}
