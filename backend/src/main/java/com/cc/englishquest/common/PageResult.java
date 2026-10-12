package com.cc.englishquest.common;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.util.List;

/**
 * 分页返回体
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class PageResult<T> implements Serializable {

    private Long total;
    private List<T> list;

    public static <T> PageResult<T> of(Long total, List<T> list) {
        return new PageResult<>(total, list);
    }
}
