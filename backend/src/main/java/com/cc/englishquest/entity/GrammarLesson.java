package com.cc.englishquest.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 语法每日关卡（28 天语法体系）
 */
@Data
@TableName("t_grammar_lesson")
public class GrammarLesson implements Serializable {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Integer dayNo;

    private String title;

    private String stage;

    /** 学习 / 复习 / 自测 */
    private String mode;

    /** 讲义内容：JSON 数组 */
    private String content;

    private Integer questionCount;

    private Integer passScore;

    private LocalDateTime createTime;
}
