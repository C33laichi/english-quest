package com.cc.englishquest.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 听力听写关卡
 */
@Data
@TableName("t_listen_level")
public class ListenLevel implements Serializable {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String name;

    /** BASIC / INTERMEDIATE / ADVANCED */
    private String difficulty;

    private String description;

    /** 每次练习抽句数 */
    private Integer questionCount;

    private Integer passScore;

    private Integer sortNo;

    private Integer status;

    private LocalDateTime createTime;
}
