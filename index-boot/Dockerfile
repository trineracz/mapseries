# Modern, multi-stage build — no application server.
# Build context is the REPO ROOT (see docker-compose.yml), so the catalog/ and
# edit/ frontends can be compiled from source here.

# Stage 1+2: compile the legacy static frontends with their ORIGINAL toolchain
# (Node 9 / npm 5.6 / gulp 3, pinned by each package-lock.json). This is the
# same build the old WildFly image ran — reproduced byte-identically — so the
# output can be trusted before the toolchain is modernized separately.
# The original docker.sh scripts are reused unchanged: they cd into
# /build/<app> and write to $JBOSS_HOME/static/<app>.
# Runs as the non-root `node` user ON PURPOSE: npm 5.6 running as root silently
# skips the `prepare` step of git dependencies, so edit's `github-api` (a git
# dependency built on install) would end up empty. The old image ran as `jboss`.
FROM --platform=linux/amd64 node:9 AS frontend-base
ENV JBOSS_HOME=/out NPM_CONFIG_PREFIX=/home/node/npm-global
ENV PATH=/home/node/npm-global/bin:$PATH
RUN mkdir -p /build /out/static && chown -R node:node /build /out
USER node
RUN npm install -g gulp-cli@2.3.0

FROM frontend-base AS catalog
COPY --chown=node:node catalog /build/catalog
RUN /build/catalog/docker.sh

FROM frontend-base AS edit
COPY --chown=node:node edit /build/edit
RUN /build/edit/docker.sh

# Stage 3: build the fat JAR with a current JDK 17 + Maven.
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /build
COPY index-boot/pom.xml .
RUN mvn -q -e -B dependency:go-offline
COPY index-boot/src ./src
COPY --from=catalog /out/static/catalog ./src/main/resources/static/catalog
COPY --from=edit /out/static/edit ./src/main/resources/static/edit
RUN mvn -q -e -B clean package -DskipTests

# Stage 4: tiny runtime image with just a JRE and the app.
FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /build/target/mapseries-server.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
