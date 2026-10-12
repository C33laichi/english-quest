package com.cc.englishquest.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * AI 调用日志
 */
@Data
@TableName("t_ai_call_log")
public class AiCallLog implements Serializable {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;

    private Long errorId;

    private String knowledgePoint;

    private Integer success;

    private Integer costMs;

    private LocalDateTime createTime;
}
