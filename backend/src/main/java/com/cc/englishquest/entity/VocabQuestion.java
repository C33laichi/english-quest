package com.cc.englishquest.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 词汇题目
 */
@Data
@TableName("t_vocab_question")
public class VocabQuestion implements Serializable {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long levelId;

    /** CHOICE 英译中选择题 / SPELL 中译英拼写题 */
    private String type;

    private String word;

    private String phonetic;

    private String meaning;

    private String optionA;

    private String optionB;

    private String optionC;

    private String optionD;

    private String answer;

    private String analysis;

    private Integer status;

    private LocalDateTime createTime;
}
