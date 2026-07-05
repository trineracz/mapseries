package cz.mzk.mapseries.config;

import org.springframework.context.MessageSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.support.ReloadableResourceBundleMessageSource;
import org.springframework.web.servlet.LocaleResolver;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.i18n.LocaleChangeInterceptor;
import org.springframework.web.servlet.i18n.SessionLocaleResolver;

import java.util.Locale;

/**
 * Locale handling carried over from the old app: default Czech, switchable via a
 * `lang` request parameter (e.g. ?lang=en).
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Bean
    public MessageSource messageSource() {
        // Explicit classpath-based bundle (the spring.messages auto-config with a
        // dotted basename did not resolve the bundle in the fat jar).
        ReloadableResourceBundleMessageSource messageSource = new ReloadableResourceBundleMessageSource();
        messageSource.setBasename("classpath:cz/mzk/locales/locale");
        messageSource.setDefaultEncoding("UTF-8");
        messageSource.setFallbackToSystemLocale(false);
        return messageSource;
    }

    @Bean
    public LocaleResolver localeResolver() {
        SessionLocaleResolver resolver = new SessionLocaleResolver();
        resolver.setDefaultLocale(Locale.forLanguageTag("cs"));
        return resolver;
    }

    @Bean
    public LocaleChangeInterceptor localeChangeInterceptor() {
        LocaleChangeInterceptor interceptor = new LocaleChangeInterceptor();
        interceptor.setParamName("lang");
        return interceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(localeChangeInterceptor());
    }

    /** The static catalog/edit frontends live under /catalog and /edit; serve their index.html. */
    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        // Redirect to the trailing-slash URL so the pages' RELATIVE asset paths
        // (e.g. main.css) resolve under /catalog/ and /edit/ instead of the root.
        registry.addRedirectViewController("/catalog", "/catalog/");
        registry.addViewController("/catalog/").setViewName("forward:/catalog/index.html");
        registry.addRedirectViewController("/edit", "/edit/");
        registry.addViewController("/edit/").setViewName("forward:/edit/index.html");
        // /admin (no slash) is handled by AdminController; /admin/ (trailing slash)
        // was unmapped and fell through to the Whitelabel error page.
        registry.addRedirectViewController("/admin/", "/admin/index.xhtml");
    }
}
