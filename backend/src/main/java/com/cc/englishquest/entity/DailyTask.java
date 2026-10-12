package com.cc.englishquest.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

/**
 * 每日任务定义
 */
@Data
@TableName("t_daily_task")
public class DailyTask implements Serializable {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String code;

    private String title;

    /** LEVEL_COUNT / CORRECT_COUNT / AI_COUNT */
    private String taskType;

    private Integer targetValue;

    private Integer rewardPoints;

    private Integer sortNo;

    private Integer status;
}
