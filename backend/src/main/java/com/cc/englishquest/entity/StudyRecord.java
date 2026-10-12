package com.cc.englishquest.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 答题记录
 */
@Data
@TableName("t_study_record")
public class StudyRecord implements Serializable {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;

    /** VOCAB / GRAMMAR / AI */
    private String module;

    private Long targetId;

    private Long questionId;

    private String userAnswer;

    private String correctAnswer;

    /** 1 正确 0 错误 */
    private Integer isCorrect;

    private Integer costTime;

    private LocalDateTime createTime;
}
