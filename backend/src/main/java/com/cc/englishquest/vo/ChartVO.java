package com.cc.englishquest.vo;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 图表数据视图（热力图 / 趋势 / 雷达）
 */
public class ChartVO {

    /** 热力图条目 */
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class HeatmapItem {
        private String date;
        private Integer count;
    }

    /** 正确率趋势条目 */
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TrendItem {
        private String date;
        private Integer total;
        private Integer correct;
        private Integer accuracy;
    }

    /** 雷达图条目（知识点掌握度） */
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RadarItem {
        private String name;
        private Integer value;
    }
}
