package com.cc.englishquest.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 语法题目
 */
@Data
@TableName("t_grammar_question")
public class GrammarQuestion implements Serializable {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long lessonId;

    /** CHOICE / FILL */
    private String type;

    private String stem;

    private String optionA;

    private String optionB;

    private String optionC;

    private String optionD;

    private String answer;

    private String analysis;

    private String knowledgePoint;

    private Integer status;

    private LocalDateTime createTime;
}
