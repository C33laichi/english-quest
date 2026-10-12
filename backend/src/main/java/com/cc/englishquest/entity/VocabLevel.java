package com.cc.englishquest.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 词汇关卡
 */
@Data
@TableName("t_vocab_level")
public class VocabLevel implements Serializable {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String name;

    /** BASIC / INTERMEDIATE / ADVANCED */
    private String difficulty;

    private String description;

    private Integer questionCount;

    private Integer passScore;

    private Integer sortNo;

    private Integer status;

    private LocalDateTime createTime;
}
