package com.cc.englishquest.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 用户关卡进度
 */
@Data
@TableName("t_user_lesson")
public class UserLesson implements Serializable {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;

    private Long lessonId;

    /** VOCAB / GRAMMAR */
    private String module;

    private Integer dayNo;

    private Integer score;

    private Integer passScore;

    private Integer stars;

    private Integer correctCnt;

    private Integer totalCnt;

    /** UNLOCKED / PASSED / MASTERED */
    private String status;

    private LocalDateTime finishTime;

    private LocalDateTime createTime;
}
