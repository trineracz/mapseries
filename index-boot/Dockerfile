# Modern, multi-stage build — no EOL base images, no application server.
# Stage 1: build the fat JAR with a current JDK 17 + Maven.
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /build
COPY pom.xml .
RUN mvn -q -e -B dependency:go-offline
COPY src ./src
RUN mvn -q -e -B clean package -DskipTests

# Stage 2: tiny runtime image with just a JRE and the app.
FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /build/target/mapseries-server.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
