package com.elementeracoast.app;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * APK-local room catalog. Only stable UI metadata lives here; online records and
 * Coast business state continue to come from the canonical Web / Cloudflare runtime.
 */
public enum CoastRoom {
    CHAT("chat", "在线海岸", "主聊天", "继续与 Myri 说话", "✦", Kind.WEB_ACTION),
    DAILY("daily", "日常岛", "海岸日报", "日报房间先打开，内容随后同步", "☼", Kind.WEB_ACTION),
    CALENDAR("calendar", "日常岛", "海岸日历", "今日一瞥、事件与便签", "◷", Kind.WEB_ACTION),
    SUMMARY("summary", "日常岛", "一日总结", "把今天轻轻收拢", "✓", Kind.WEB_ACTION),
    MOMENTS("moments", "日常岛", "碳硅圈", "海岸内部朋友圈", "♡", Kind.WEB_ACTION),
    DIARY("diary", "日常岛", "日记", "留下今天的纸页", "✎", Kind.WEB_ACTION),
    ALBUM("album", "日常岛", "相册", "海岸图片引用墙", "▣", Kind.WEB_ACTION),
    PETS("pets", "日常岛", "宠物区", "现有占位房间", "♧", Kind.WEB_ACTION),
    WIDGETS("widgets", "日常岛", "未来小组件", "现有占位房间", "＋", Kind.WEB_ACTION),
    MAILBOX("mailbox", "房间与记忆", "信箱", "访客信箱与来信", "✉", Kind.WEB_PAGE),
    LIGHTHOUSE("lighthouse", "房间与记忆", "灯塔", "灯塔来信", "⌂", Kind.WEB_ACTION),
    RADIO("radio", "房间与记忆", "Radio", "无线电波的两端", "⌁", Kind.WEB_ACTION),
    DOGTALK("dogtalk", "房间与记忆", "Dogtalk", "小寒的低权重神秘狗话", "∿", Kind.WEB_ACTION),
    MEMORY("memory", "房间与记忆", "记忆", "轨迹、思维壤与记忆入口", "◎", Kind.WEB_ACTION),
    UPDATES("updates", "CoastGPT", "更新中心", "本地版本骨架与线上清单", "↑", Kind.LOCAL_UPDATE),
    ABOUT("about", "CoastGPT", "关于 CoastGPT", "版本、签名与运行边界", "i", Kind.LOCAL_ABOUT);

    public enum Kind {
        WEB_ACTION,
        WEB_PAGE,
        LOCAL_UPDATE,
        LOCAL_ABOUT
    }

    private static final List<CoastRoom> ALL = Collections.unmodifiableList(
            Arrays.asList(values())
    );

    public final String id;
    public final String group;
    public final String title;
    public final String subtitle;
    public final String symbol;
    public final Kind kind;

    CoastRoom(
            String id,
            String group,
            String title,
            String subtitle,
            String symbol,
            Kind kind
    ) {
        this.id = id;
        this.group = group;
        this.title = title;
        this.subtitle = subtitle;
        this.symbol = symbol;
        this.kind = kind;
    }

    public static List<CoastRoom> all() {
        return ALL;
    }

    public static CoastRoom fromId(String value) {
        if (value == null) {
            return null;
        }
        for (CoastRoom room : values()) {
            if (room.id.equals(value)) {
                return room;
            }
        }
        return null;
    }
}
