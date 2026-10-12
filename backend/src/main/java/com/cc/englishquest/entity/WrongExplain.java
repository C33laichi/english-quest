package com.cc.englishquest.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 错题针对性解析缓存
 *
 * <p>一条记录 = 「某道题的某个错项该怎么讲」。因为讲解文案与具体学生无关，
 * 所以主键维度里没有 user_id，这样不同学生错同一题同一选项时可以直接复用。</p>
 */
@Data
@TableName("t_wrong_explain")
public class WrongExplain implements Serializable {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** GRAMMAR / VOCAB / LISTENING */
    private String module;

    private Long questionId;

    /**
     * 学生作答。<b>含义随模块变化</b>：
     * 选项题（GRAMMAR / VOCAB）是所选错项 key（A/B/C/D）；
     * 听力听写（LISTENING）没有选项，直接存学生敲出的整句英文，
     * 因此数据库列宽为 VARCHAR(300)（见 sql/06_wrong_explain.sql）。
     */
    private String chosen;

    private String content;

    /** LLM / MOCK / FALLBACK */
    private String source;

    private LocalDateTime createTime;
}
