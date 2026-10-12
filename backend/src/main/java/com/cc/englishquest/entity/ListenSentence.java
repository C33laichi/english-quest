package com.cc.englishquest.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 听力听写句子语料
 */
@Data
@TableName("t_listen_sentence")
public class ListenSentence implements Serializable {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long levelId;

    /** 英文原句（答案，练习阶段不下发） */
    private String english;

    /** 中文译文（提示语） */
    private String chinese;

    /** 归一化后的单词数 */
    private Integer wordCount;

    private Integer sortNo;

    private Integer status;

    private LocalDateTime createTime;
}
