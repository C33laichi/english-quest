package com.cc.englishquest.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 用户任务进度
 */
@Data
@TableName("t_user_task")
public class UserTask implements Serializable {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;

    private LocalDate taskDate;

    private String taskCode;

    private Integer progress;

    private Integer finished;

    private Integer claimed;

    private LocalDateTime createTime;
}
