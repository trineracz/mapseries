package cz.mzk.mapseries;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Entry point for the modern (Spring Boot) mapseries backend that replaces the
 * WildFly/JSF `index` application. Runs as a single self-contained JAR with an
 * embedded server — no application server required.
 */
@SpringBootApplication
@EnableAsync
@EnableScheduling
@ConfigurationPropertiesScan
public class MapseriesApplication {

    public static void main(String[] args) {
        SpringApplication.run(MapseriesApplication.class, args);
    }
}
