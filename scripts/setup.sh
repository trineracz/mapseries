#!/bin/bash

set -e
set -x

# CentOS 7 reached end-of-life (June 2024) and its mirror hosts were shut down,
# so the default yum repos no longer resolve. Redirect them to the vault archive.
sed -i \
  -e 's|^mirrorlist=|#mirrorlist=|g' \
  -e 's|^#baseurl=http://mirror.centos.org|baseurl=http://vault.centos.org|g' \
  /etc/yum.repos.d/CentOS-*.repo

MAVEN_URL=https://archive.apache.org/dist/maven/maven-3/3.5.4/binaries/apache-maven-3.5.4-bin.tar.gz
MAVEN_ARCHIVE_FILE=maven.tar.gz
MAVEN_LOCATION=/opt

curl -sL https://rpm.nodesource.com/setup_9.x | bash -

yum update -y

yum install -y \
  nodejs \
  git \
  wget

yum clean all

wget -q -O $MAVEN_LOCATION/$MAVEN_ARCHIVE_FILE $MAVEN_URL
cd $MAVEN_LOCATION
tar -xvf $MAVEN_ARCHIVE_FILE
ln -s $MAVEN_LOCATION/apache-maven-*/bin/mvn /usr/bin/mvn

# Pin gulp-cli: the latest (3.x) requires Node >= 10, but this image ships Node 9.
npm install -g gulp-cli@2.3.0

mkdir -p $JBOSS_HOME/modules/org/postgresql/main
cp /configs/postgres/* $JBOSS_HOME/modules/org/postgresql/main
cp /configs/standalone-full-mapseries.xml $JBOSS_HOME/standalone/configuration
