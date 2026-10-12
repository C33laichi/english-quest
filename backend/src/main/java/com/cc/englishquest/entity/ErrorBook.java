package com.cc.englishquest.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 错题本
 */
@Data
@TableName("t_error_book")
public class ErrorBook implements Serializable {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;

    /** VOCAB / GRAMMAR / LISTENING */
    private String module;

    private Long questionId;

    private String knowledgePoint;

    private String stem;

    private String correctAnswer;

    private String wrongAnswer;

    private String analysis;

    private Integer wrongTimes;

    /** 0 未掌握 1 已掌握 */
    private Integer status;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
