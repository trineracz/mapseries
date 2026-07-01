package cz.mzk.mapseries.util;

import org.springframework.stereotype.Component;

/**
 * Ported from the old jsf/beans/tools/StringUtils. Exposed as a bean named
 * "stringUtils" so Thymeleaf can call ${@stringUtils.shortenWords(...)}.
 */
@Component("stringUtils")
public class StringUtils {

    public String shortenWords(String str, int maxLength) {
        if (str == null) {
            return "";
        }
        StringBuilder result = new StringBuilder();
        int wordLength = 0;

        for (int i = 0; i < str.length(); i++) {
            char c = str.charAt(i);
            if (Character.isAlphabetic(c)) {
                if (wordLength < maxLength) {
                    result.append(c);
                } else if (wordLength == maxLength) {
                    result.append("...");
                }
                wordLength++;
            } else {
                wordLength = 0;
                result.append(c);
            }
        }
        return result.toString();
    }
}
