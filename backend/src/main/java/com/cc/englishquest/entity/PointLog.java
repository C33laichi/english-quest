package com.cc.englishquest.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 积分流水
 */
@Data
@TableName("t_point_log")
public class PointLog implements Serializable {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;

    private Integer changePoints;

    /** ANSWER / LEVEL / FULL_SCORE / LOGIN / CHECKIN / TASK */
    private String type;

    /** 业务唯一标识，防重复发放 */
    private String bizId;

    private String remark;

    private LocalDateTime createTime;
}
